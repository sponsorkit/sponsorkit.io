package sponsorkit

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"sync"
)

// Storage persists the per-target-set state (session token, cache and nag
// state). Keys are targets_hash values; data is the PROTOCOL §8 JSON document.
// Implementations must be safe for concurrent use.
type Storage interface {
	// Read returns the stored document, or (nil, nil) when there is none.
	Read(key string) ([]byte, error)
	// Write replaces the stored document atomically.
	Write(key string, data []byte) error
}

// DirStorage is the default Storage: one file named <key>.json per target set
// in Dir (PROTOCOL §8). The directory is created with mode 0700 and files with
// mode 0600; writes go to a temporary file that is renamed over the target.
type DirStorage struct {
	Dir string
}

// DefaultStorageDir returns the per-user configuration directory used when
// neither StorageDir nor Storage is set: $XDG_CONFIG_HOME/sponsorkit (or
// ~/.config/sponsorkit) on Linux, ~/Library/Application Support/sponsorkit on
// macOS and %AppData%\sponsorkit on Windows.
func DefaultStorageDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "sponsorkit"), nil
}

func (s *DirStorage) path(key string) string { return filepath.Join(s.Dir, key+".json") }

// Read implements Storage.
func (s *DirStorage) Read(key string) ([]byte, error) {
	b, err := os.ReadFile(s.path(key))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	return b, err
}

// Write implements Storage.
func (s *DirStorage) Write(key string, data []byte) error {
	if err := os.MkdirAll(s.Dir, 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(s.Dir, key+".json.*.tmp") // mode 0600
	if err != nil {
		return err
	}
	name := tmp.Name()
	ok := false
	defer func() {
		if !ok {
			_ = tmp.Close()
			_ = os.Remove(name)
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		return err
	}
	if err := tmp.Sync(); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(name, s.path(key)); err != nil {
		return err
	}
	ok = true
	return nil
}

// memoryStorage keeps documents in memory (mock mode).
type memoryStorage struct {
	mu   sync.Mutex
	data map[string][]byte
}

func (m *memoryStorage) Read(key string) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.data[key], nil
}

func (m *memoryStorage) Write(key string, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.data == nil {
		m.data = map[string][]byte{}
	}
	m.data[key] = append([]byte(nil), data...)
	return nil
}

// storageFile is the PROTOCOL §8 document.
type storageFile struct {
	V            int                 `json:"v"`
	SessionToken *string             `json:"sessionToken,omitempty"`
	Cache        *cacheEntry         `json:"cache,omitempty"`
	Nags         map[string]nagState `json:"nags,omitempty"`
}

type cacheEntry struct {
	Result   Result `json:"result"`
	StoredAt string `json:"storedAt"`
}

type nagState struct {
	Runs      int     `json:"runs"`
	LastShown *string `json:"lastShown"`
}

func (s *storageFile) token() string {
	if s == nil || s.SessionToken == nil {
		return ""
	}
	return *s.SessionToken
}

func strPtr(s string) *string { return &s }

// store wraps a Storage with parsing and in-process locking for
// read-modify-write updates.
type store struct {
	backend Storage
	key     string
	lock    *sync.Mutex
}

var storeLocks sync.Map // lock key -> *sync.Mutex

type lockKey struct {
	backend any
	key     string
}

func newStore(backend Storage, key string) *store {
	var lk any
	switch b := backend.(type) {
	case *DirStorage:
		dir := b.Dir
		if abs, err := filepath.Abs(dir); err == nil {
			dir = abs
		}
		lk = "dir:" + dir + "|" + key
	default:
		if !reflect.TypeOf(backend).Comparable() {
			return &store{backend: backend, key: key, lock: &sync.Mutex{}}
		}
		lk = lockKey{backend: backend, key: key}
	}
	m, _ := storeLocks.LoadOrStore(lk, &sync.Mutex{})
	return &store{backend: backend, key: key, lock: m.(*sync.Mutex)}
}

func parseStorage(b []byte) *storageFile {
	var f storageFile
	if len(b) == 0 || json.Unmarshal(b, &f) != nil || f.V != 1 {
		return &storageFile{V: 1}
	}
	if f.Cache != nil && f.Cache.StoredAt == "" {
		f.Cache = nil
	}
	return &f
}

// read returns the stored document; missing or corrupt documents read as empty.
func (s *store) read() *storageFile {
	b, err := s.backend.Read(s.key)
	if err != nil {
		return &storageFile{V: 1}
	}
	return parseStorage(b)
}

// exists reports whether a document is stored.
func (s *store) exists() bool {
	b, err := s.backend.Read(s.key)
	return err == nil && b != nil
}

// update applies fn to the current document and writes the result. When fn
// returns nil nothing is written.
func (s *store) update(fn func(f *storageFile) *storageFile) error {
	s.lock.Lock()
	defer s.lock.Unlock()
	next := fn(s.read())
	if next == nil {
		return nil
	}
	next.V = 1
	b, err := json.Marshal(next)
	if err != nil {
		return err
	}
	return s.backend.Write(s.key, b)
}
