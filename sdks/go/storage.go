package sponsorkit

import (
	"bytes"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sync"
	"unicode/utf8"
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
	if !filepath.IsAbs(base) {
		// A relative HOME would resolve against the working directory.
		return "", errors.New("the per-user config directory is not an absolute path")
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

// sessionTokenPattern is a well-formed stored session token: sks_ followed
// by printable ASCII.
var sessionTokenPattern = regexp.MustCompile(`^sks_[\x21-\x7e]+$`)

// parseStorage parses a PROTOCOL §8 document. It never fails (PROTOCOL §7.0):
// a document that cannot be parsed reads as empty, and each malformed part
// (token, cache, nag entry) reads as absent while the rest is kept.
func parseStorage(b []byte) *storageFile {
	empty := &storageFile{V: 1}
	if len(b) == 0 || !utf8.Valid(b) {
		return empty
	}
	var raw map[string]json.RawMessage
	if json.Unmarshal(b, &raw) != nil || raw == nil {
		return empty
	}
	var v int
	if json.Unmarshal(raw["v"], &v) != nil || v != 1 {
		return empty
	}
	f := &storageFile{V: 1}
	var tok string
	if json.Unmarshal(raw["sessionToken"], &tok) == nil && sessionTokenPattern.MatchString(tok) {
		f.SessionToken = &tok
	}
	f.Cache = parseCache(raw["cache"])
	f.Nags = parseNags(raw["nags"])
	return f
}

// isJSONKind reports whether raw is a JSON value starting with open ('{' or '[').
func isJSONKind(raw json.RawMessage, open byte) bool {
	t := bytes.TrimLeft(raw, " \t\r\n")
	return len(t) > 0 && t[0] == open
}

func parseCache(raw json.RawMessage) *cacheEntry {
	if !isJSONKind(raw, '{') {
		return nil
	}
	var c struct {
		Result   json.RawMessage `json:"result"`
		StoredAt string          `json:"storedAt"`
	}
	if json.Unmarshal(raw, &c) != nil || !isJSONKind(c.Result, '{') {
		return nil
	}
	if _, ok := parseISOTime(c.StoredAt); !ok {
		return nil
	}
	var parts map[string]json.RawMessage
	if json.Unmarshal(c.Result, &parts) != nil ||
		!isJSONKind(parts["targets"], '[') || !isJSONKind(parts["contributions"], '[') {
		return nil
	}
	var items []json.RawMessage
	if json.Unmarshal(parts["contributions"], &items) != nil {
		return nil
	}
	for _, it := range items {
		if !isJSONKind(it, '{') {
			return nil
		}
	}
	var r Result
	if json.Unmarshal(c.Result, &r) != nil {
		return nil
	}
	if r.Contributions == nil {
		r.Contributions = []Contribution{}
	}
	return &cacheEntry{Result: r, StoredAt: c.StoredAt}
}

func parseNags(raw json.RawMessage) map[string]nagState {
	if !isJSONKind(raw, '{') {
		return nil
	}
	var entries map[string]json.RawMessage
	if json.Unmarshal(raw, &entries) != nil {
		return nil
	}
	var out map[string]nagState
	for id, e := range entries {
		var n nagState
		if !isJSONKind(e, '{') || json.Unmarshal(e, &n) != nil || n.Runs < 0 {
			continue
		}
		if n.LastShown != nil {
			if _, ok := parseISOTime(*n.LastShown); !ok {
				continue
			}
		}
		if out == nil {
			out = map[string]nagState{}
		}
		out[id] = n
	}
	return out
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
