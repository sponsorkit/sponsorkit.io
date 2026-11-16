package sponsorkit

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"
)

func TestEmbeddedMockPresetsAreIdentical(t *testing.T) {
	fixture, err := os.ReadFile(filepath.Join("..", "conformance", "fixtures", "mock-presets.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(fixture, mockPresetsJSON) {
		t.Fatal("mock-presets.json differs from sdks/conformance/fixtures/mock-presets.json; copy it again")
	}
}

func TestParseRetryAfter(t *testing.T) {
	now := time.Date(2026, 11, 16, 12, 0, 0, 0, time.UTC)
	type want struct {
		d    time.Duration
		sent bool
	}
	cases := map[string]want{
		"":                              {defaultRetryAfter, false},
		"30":                            {30 * time.Second, true},
		"1.5":                           {1500 * time.Millisecond, true},
		"Mon, 16 Nov 2026 12:00:10 GMT": {10 * time.Second, true},
		"Mon, 16 Nov 2026 11:00:00 GMT": {0, true},
		"soon":                          {defaultRetryAfter, false},
		// Huge or non-finite values must not overflow to a negative duration.
		"1e12":                          {maxRetryAfter, true},
		"99999999999":                   {maxRetryAfter, true},
		"86401":                         {maxRetryAfter, true},
		"Inf":                           {defaultRetryAfter, false},
		"+Inf":                          {defaultRetryAfter, false},
		"NaN":                           {defaultRetryAfter, false},
		"Fri, 01 Jan 2300 00:00:00 GMT": {maxRetryAfter, true},
	}
	for in, w := range cases {
		if got, sent := parseRetryAfter(in, now); got != w.d || sent != w.sent {
			t.Errorf("parseRetryAfter(%q) = %v, %v, want %v, %v", in, got, sent, w.d, w.sent)
		}
	}
}

func TestDirStorageAtomicAndPermissions(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "state", "sponsorkit")
	s := newStore(&DirStorage{Dir: dir}, "abc")
	if s.exists() {
		t.Fatal("nothing should be stored yet")
	}
	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = s.update(func(f *storageFile) *storageFile {
				if f.Nags == nil {
					f.Nags = map[string]nagState{}
				}
				n := f.Nags["x"]
				n.Runs++
				f.Nags["x"] = n
				return f
			})
		}()
	}
	wg.Wait()
	if got := s.read().Nags["x"].Runs; got != 16 {
		t.Errorf("in-process updates are serialized: runs = %d, want 16", got)
	}
	tmps, _ := filepath.Glob(filepath.Join(dir, "*.tmp"))
	if len(tmps) != 0 {
		t.Errorf("temporary files left behind: %v", tmps)
	}
	if runtime.GOOS != "windows" {
		for path, want := range map[string]os.FileMode{dir: 0o700, filepath.Join(dir, "abc.json"): 0o600} {
			st, err := os.Stat(path)
			if err != nil || st.Mode().Perm() != want {
				t.Errorf("%s: mode %v, %v; want %v", path, st.Mode().Perm(), err, want)
			}
		}
	}
	// Corrupt files read as empty instead of failing.
	if err := os.WriteFile(filepath.Join(dir, "abc.json"), []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if f := s.read(); f.V != 1 || f.token() != "" {
		t.Errorf("corrupt file: %+v", f)
	}
}

func TestEnvSet(t *testing.T) {
	for v, want := range map[string]bool{"": false, "0": false, "false": false, "False": false, " ": false, "1": true, "true": true, "yes": true} {
		if envSet(v) != want {
			t.Errorf("envSet(%q) != %v", v, want)
		}
	}
}

func TestGitHubLoginRules(t *testing.T) {
	for login, want := range map[string]bool{
		"a": true, "a-b": true, "a1-b2-c3": true, "-a": false, "a-": false, "a--b": false, "a_b": false,
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": true, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": false,
	} {
		if got := validGitHubLogin(login); got != want {
			t.Errorf("validGitHubLogin(%q) = %v, want %v", login, got, want)
		}
	}
}
