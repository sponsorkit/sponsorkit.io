package sponsorkit

// Regression tests for PROTOCOL §7.0 "Robustness rules (all SDKs)".

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sync/atomic"
	"testing"
	"time"
)

const robustResultJSON = `{"signedIn":true,"disabled":false,"mock":false,"targets":["github:octocat"],` +
	`"supporter":{"id":"sup_1","identities":[]},"contributions":[],"fetchedAt":"2026-11-16T12:00:00.000Z","stale":false,"fromCache":false}`

// tokenServer answers /api/v1/auth/token with a fresh session and
// /api/v1/contributions with handler (when non-nil).
func tokenServer(t *testing.T, contributions http.HandlerFunc) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/auth/token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"sessionToken":"sks_new","expiresAt":"2027-01-01T00:00:00Z","result":`+robustResultJSON+`}`)
		case "/api/v1/contributions":
			if contributions != nil {
				contributions(w, r)
				return
			}
			_, _ = io.WriteString(w, robustResultJSON)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func pasteCode(context.Context, string) (string, error) { return "skc_x", nil }

func TestRequestTimeoutDefaultAndDisable(t *testing.T) {
	c, err := New(Options{GitHub: "octocat", Env: map[string]string{}})
	if err != nil {
		t.Fatal(err)
	}
	if c.reqTimeout != 30*time.Second {
		t.Errorf("default request timeout = %v, want 30s", c.reqTimeout)
	}
	if got := requestTimeoutOf(NoRequestTimeout); got != 0 {
		t.Errorf("NoRequestTimeout maps to %v, want 0 (none)", got)
	}
	if got := requestTimeoutOf(2 * time.Second); got != 2*time.Second {
		t.Errorf("explicit timeout maps to %v", got)
	}
}

func TestRequestTimeoutIsNetworkError(t *testing.T) {
	release := make(chan struct{})
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Drain the body so the server notices the client hanging up.
		_, _ = io.Copy(io.Discard, r.Body)
		select {
		case <-release:
		case <-r.Context().Done():
		}
	}))
	// Cleanups run LIFO: unblock the handlers first, then close the server
	// (Close waits for in-flight handlers).
	t.Cleanup(slow.Close)
	t.Cleanup(func() { close(release) })
	const timeout = 150 * time.Millisecond

	// SignIn: the code exchange times out.
	c, err := New(Options{
		GitHub: "octocat", StorageDir: t.TempDir(), APIBaseURL: slow.URL, RequestTimeout: timeout,
		SignInMethod: SignInPaste, PromptForCode: pasteCode, Stderr: io.Discard, Env: map[string]string{},
	})
	if err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	_, err = c.SignIn(context.Background())
	if ErrorCodeOf(err) != CodeNetworkError {
		t.Errorf("SignIn with a hung /auth/token: %v, want network_error", err)
	}
	if time.Since(start) > 5*time.Second {
		t.Errorf("SignIn took %v; RequestTimeout not applied", time.Since(start))
	}

	// GetFinancialContribution: serves the stale cache.
	dir := t.TempDir()
	doc := `{"v":1,"sessionToken":"sks_old","cache":{"result":` + robustResultJSON + `,"storedAt":"2020-01-01T00:00:00Z"}}`
	c, err = New(Options{GitHub: "octocat", StorageDir: dir, APIBaseURL: slow.URL, RequestTimeout: timeout, Env: map[string]string{}})
	if err != nil {
		t.Fatal(err)
	}
	if err := c.store().backend.Write(c.hash, []byte(doc)); err != nil {
		t.Fatal(err)
	}
	r, err := c.GetFinancialContribution(context.Background(), WithCacheTTL(0))
	if err != nil || !r.FromCache || !r.Stale || !r.SignedIn {
		t.Errorf("timed-out refresh = %+v, %v; want the stale cache", r, err)
	}
	if c.SessionToken() != "sks_old" {
		t.Error("a timeout must keep the token")
	}

	// VerifySession: network_error.
	_, err = VerifySession(context.Background(), "sks_old", Targets{GitHub: "octocat"},
		WithAPIBaseURL(slow.URL), WithRequestTimeout(timeout))
	if ErrorCodeOf(err) != CodeNetworkError {
		t.Errorf("VerifySession with a hung API: %v, want network_error", err)
	}
}

func TestTokenExchangeUnexpected400Codes(t *testing.T) {
	for _, body := range []string{`{"code":"invalid_target"}`, `{}`, ``} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, body)
		}))
		c, _ := New(Options{
			GitHub: "octocat", StorageDir: t.TempDir(), APIBaseURL: srv.URL,
			SignInMethod: SignInPaste, PromptForCode: pasteCode, Stderr: io.Discard, Env: map[string]string{},
		})
		if _, err := c.SignIn(context.Background()); ErrorCodeOf(err) != CodeNetworkError {
			t.Errorf("400 %q: %v, want network_error", body, err)
		}
		srv.Close()
	}
}

func TestParseRetryAfterNonFiniteAndHuge(t *testing.T) {
	now := time.Now()
	for _, v := range []string{"1e400", "-1e400", "-5", "Infinity", "nan"} {
		if d, sent := parseRetryAfter(v, now); sent || d != defaultRetryAfter {
			t.Errorf("parseRetryAfter(%q) = %v, %v; want it ignored", v, d, sent)
		}
	}
	if d, sent := parseRetryAfter("1e300", now); !sent || d != maxRetryAfter {
		t.Errorf("parseRetryAfter(1e300) = %v, %v; want clamped to 24h", d, sent)
	}
}

func TestLoopbackMalformedCallbackKeepsWaiting(t *testing.T) {
	srv := tokenServer(t, nil)
	var statuses []int
	openerDone := make(chan struct{})
	c, err := New(Options{
		GitHub: "octocat", StorageDir: t.TempDir(), APIBaseURL: srv.URL, SignInMethod: SignInLoopback,
		SignInTimeout: 10 * time.Second, Stderr: io.Discard, Env: map[string]string{},
		OpenBrowser: func(ctx context.Context, u string) error {
			defer close(openerDone)
			pu, _ := url.Parse(u)
			cb := pu.Query().Get("redirect_uri")
			for _, q := range []string{"", "?code=", "?error=", "?code=&error=", "?state=x", "?code=skc_ok"} {
				res, err := http.Get(cb + q)
				if err != nil {
					return err
				}
				_ = res.Body.Close()
				statuses = append(statuses, res.StatusCode)
			}
			return nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := c.SignIn(context.Background()); err != nil {
		t.Fatalf("SignIn after malformed callbacks: %v", err)
	}
	<-openerDone // SignIn may return before the opener records the last status
	want := []int{400, 400, 400, 400, 400, 200}
	if len(statuses) != len(want) {
		t.Fatalf("statuses = %v", statuses)
	}
	for i := range want {
		if statuses[i] != want[i] {
			t.Errorf("callback %d: status %d, want %d", i, statuses[i], want[i])
		}
	}
}

func TestLoopbackBindFailureFallsBackToPaste(t *testing.T) {
	orig := listenLoopback
	listenLoopback = func() (net.Listener, error) { return nil, errors.New("bind: permission denied") }
	t.Cleanup(func() { listenLoopback = orig })
	srv := tokenServer(t, nil)
	var pasted, opened atomic.Bool
	c, _ := New(Options{
		GitHub: "octocat", StorageDir: t.TempDir(), APIBaseURL: srv.URL, Stderr: io.Discard, Env: map[string]string{},
		OpenBrowser:   func(context.Context, string) error { opened.Store(true); return nil },
		PromptForCode: func(ctx context.Context, u string) (string, error) { pasted.Store(true); return pasteCode(ctx, u) },
	})
	if _, err := c.SignIn(context.Background()); err != nil || !pasted.Load() || opened.Load() {
		t.Errorf("auto with a bind failure: err=%v pasted=%v opened=%v; want paste-back", err, pasted.Load(), opened.Load())
	}
	c, _ = New(Options{
		GitHub: "octocat", StorageDir: t.TempDir(), APIBaseURL: srv.URL, Stderr: io.Discard, Env: map[string]string{},
		SignInMethod: SignInLoopback, PromptForCode: pasteCode,
	})
	if _, err := c.SignIn(context.Background()); ErrorCodeOf(err) != CodeNetworkError {
		t.Errorf("forced loopback with a bind failure: %v, want network_error", err)
	}
}

func TestOpenerFailureFallsBackToPaste(t *testing.T) {
	srv := tokenServer(t, nil)
	var pasted atomic.Bool
	c, _ := New(Options{
		GitHub: "octocat", StorageDir: t.TempDir(), APIBaseURL: srv.URL, Stderr: io.Discard, Env: map[string]string{},
		OpenBrowser:   func(context.Context, string) error { return errors.New("xdg-open: exit status 3") },
		PromptForCode: func(ctx context.Context, u string) (string, error) { pasted.Store(true); return pasteCode(ctx, u) },
	})
	if _, err := c.SignIn(context.Background()); err != nil || !pasted.Load() {
		t.Errorf("opener failure: err=%v pasted=%v; want the paste-back fallback", err, pasted.Load())
	}
}

func TestCallbackAcceptedWhileOpenerRuns(t *testing.T) {
	srv := tokenServer(t, nil)
	deliver := func(u string) error {
		pu, _ := url.Parse(u)
		res, err := http.Get(pu.Query().Get("redirect_uri") + "?code=skc_ok")
		if err == nil {
			_ = res.Body.Close()
		}
		return err
	}
	for name, open := range map[string]func(ctx context.Context, u string) error{
		// The opener delivers the callback and then keeps running until the
		// sign-in ends.
		"still running": func(ctx context.Context, u string) error {
			if err := deliver(u); err != nil {
				return err
			}
			select { // a real launcher keeps running for a while
			case <-ctx.Done():
			case <-time.After(2 * time.Second):
			}
			return nil
		},
		// The opener delivers the callback, then reports a failure: the
		// callback wins.
		"fails after callback": func(ctx context.Context, u string) error {
			if err := deliver(u); err != nil {
				return err
			}
			time.Sleep(50 * time.Millisecond)
			return errors.New("exit status 1")
		},
	} {
		var pasted atomic.Bool
		c, _ := New(Options{
			GitHub: "octocat", StorageDir: t.TempDir(), APIBaseURL: srv.URL, Stderr: io.Discard, Env: map[string]string{},
			SignInTimeout: 10 * time.Second, OpenBrowser: open,
			PromptForCode: func(ctx context.Context, u string) (string, error) { pasted.Store(true); return "", errors.New("no") },
		})
		done := make(chan error, 1)
		go func() { _, err := c.SignIn(context.Background()); done <- err }()
		select {
		case err := <-done:
			if err != nil || pasted.Load() {
				t.Errorf("%s: err=%v pasted=%v", name, err, pasted.Load())
			}
		case <-time.After(5 * time.Second):
			t.Fatalf("%s: SignIn did not accept the callback while the opener was running", name)
		}
	}
}

func TestStorageReadNeverFails(t *testing.T) {
	result := robustResultJSON
	cache := `{"result":` + result + `,"storedAt":"2026-11-16T12:00:00.000Z"}`
	type want struct {
		token string
		cache bool
		nags  []string
	}
	cases := map[string]struct {
		doc string
		w   want
	}{
		"not json":            {`{"v":1,`, want{}},
		"invalid utf-8":       {"{\"v\":1,\"sessionToken\":\"sks_\xff\xfe\"}", want{}},
		"array document":      {`[1,2]`, want{}},
		"null document":       {`null`, want{}},
		"wrong version":       {`{"v":2,"sessionToken":"sks_a"}`, want{}},
		"version as string":   {`{"v":"1","sessionToken":"sks_a"}`, want{}},
		"good":                {`{"v":1,"sessionToken":"sks_a","cache":` + cache + `,"nags":{"n":{"runs":2,"lastShown":null}}}`, want{"sks_a", true, []string{"n"}}},
		"token not string":    {`{"v":1,"sessionToken":5,"cache":` + cache + `}`, want{"", true, nil}},
		"token bad prefix":    {`{"v":1,"sessionToken":"abc"}`, want{}},
		"token bare prefix":   {`{"v":1,"sessionToken":"sks_"}`, want{}},
		"token with space":    {`{"v":1,"sessionToken":"sks_a b"}`, want{}},
		"token non-ascii":     {`{"v":1,"sessionToken":"sks_é"}`, want{}},
		"token control char":  {`{"v":1,"sessionToken":"sks_a\n"}`, want{}},
		"cache not object":    {`{"v":1,"sessionToken":"sks_a","cache":"x"}`, want{"sks_a", false, nil}},
		"cache bad date":      {`{"v":1,"sessionToken":"sks_a","cache":{"result":` + result + `,"storedAt":"yesterday"}}`, want{"sks_a", false, nil}},
		"cache date number":   {`{"v":1,"sessionToken":"sks_a","cache":{"result":` + result + `,"storedAt":5}}`, want{"sks_a", false, nil}},
		"cache null result":   {`{"v":1,"sessionToken":"sks_a","cache":{"result":null,"storedAt":"2026-11-16T12:00:00Z"}}`, want{"sks_a", false, nil}},
		"null contributions":  {`{"v":1,"sessionToken":"sks_a","cache":{"result":{"targets":[],"contributions":null},"storedAt":"2026-11-16T12:00:00Z"}}`, want{"sks_a", false, nil}},
		"null targets":        {`{"v":1,"sessionToken":"sks_a","cache":{"result":{"targets":null,"contributions":[]},"storedAt":"2026-11-16T12:00:00Z"}}`, want{"sks_a", false, nil}},
		"null contribution":   {`{"v":1,"sessionToken":"sks_a","cache":{"result":{"targets":[],"contributions":[null]},"storedAt":"2026-11-16T12:00:00Z"}}`, want{"sks_a", false, nil}},
		"string contribution": {`{"v":1,"sessionToken":"sks_a","cache":{"result":{"targets":[],"contributions":["x"]},"storedAt":"2026-11-16T12:00:00Z"}}`, want{"sks_a", false, nil}},
		"wrong field type":    {`{"v":1,"sessionToken":"sks_a","cache":{"result":{"targets":[],"contributions":[],"signedIn":"yes"},"storedAt":"2026-11-16T12:00:00Z"}}`, want{"sks_a", false, nil}},
		"nags not object":     {`{"v":1,"sessionToken":"sks_a","nags":[1]}`, want{"sks_a", false, nil}},
		"bad nag entries": {`{"v":1,"nags":{"ok":{"runs":1,"lastShown":"2026-11-16T12:00:00.1234567890123Z"},"num":3,"null":null,` +
			`"runs":{"runs":"x"},"neg":{"runs":-1},"date":{"runs":1,"lastShown":"later"},"datetype":{"runs":1,"lastShown":7}}}`, want{"", false, []string{"ok"}}},
	}
	for name, tc := range cases {
		f := parseStorage([]byte(tc.doc))
		if f == nil {
			t.Errorf("%s: nil document", name)
			continue
		}
		if f.token() != tc.w.token {
			t.Errorf("%s: token %q, want %q", name, f.token(), tc.w.token)
		}
		if (f.Cache != nil) != tc.w.cache {
			t.Errorf("%s: cache present = %v, want %v", name, f.Cache != nil, tc.w.cache)
		}
		if len(f.Nags) != len(tc.w.nags) {
			t.Errorf("%s: nags %v, want %v", name, f.Nags, tc.w.nags)
		}
		for _, id := range tc.w.nags {
			if _, ok := f.Nags[id]; !ok {
				t.Errorf("%s: nag %q missing", name, id)
			}
		}
	}
}

func TestMalformedStorageThroughClient(t *testing.T) {
	dir := t.TempDir()
	c, _ := New(Options{GitHub: "octocat", StorageDir: dir, APIBaseURL: "http://127.0.0.1:1", Env: map[string]string{}})
	if err := os.WriteFile(filepath.Join(dir, c.hash+".json"), []byte("{\"v\":1,\"sessionToken\":\"sks_\xff\"}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if c.IsSignedIn() {
		t.Error("an invalid token must read as signed out")
	}
	if r, err := c.GetFinancialContribution(context.Background()); err != nil || r.SignedIn {
		t.Errorf("malformed storage: %+v, %v", r, err)
	}
	if err := c.SignOut(context.Background()); err != nil {
		t.Errorf("SignOut over malformed storage: %v", err)
	}
}

func TestISOTimestampsAnyFractionLength(t *testing.T) {
	for _, s := range []string{
		"2026-11-16T12:00:00Z", "2026-11-16T12:00:00.1Z", "2026-11-16T12:00:00.12Z",
		"2026-11-16T12:00:00.123456Z", "2026-11-16T12:00:00.123456789Z",
		"2026-11-16T12:00:00.123456789012345Z", "2026-11-16T13:00:00.5+01:00",
	} {
		if _, ok := parseISOTime(s); !ok {
			t.Errorf("parseISOTime(%q) rejected", s)
		}
	}
	// A cache stored with a 12-digit fraction is served as fresh.
	now := time.Date(2026, 11, 16, 12, 0, 1, 0, time.UTC)
	c, _ := New(Options{GitHub: "octocat", StorageDir: t.TempDir(), APIBaseURL: "http://127.0.0.1:1",
		Clock: func() time.Time { return now }, Env: map[string]string{}})
	doc := `{"v":1,"sessionToken":"sks_a","cache":{"result":` + robustResultJSON + `,"storedAt":"2026-11-16T12:00:00.123456789012Z"}}`
	if err := c.store().backend.Write(c.hash, []byte(doc)); err != nil {
		t.Fatal(err)
	}
	if r, _ := c.GetFinancialContribution(context.Background()); !r.FromCache || r.Stale {
		t.Errorf("fresh cache with a long fraction: %+v", r)
	}
}

// failingStorage reads doc and fails every write.
type failingStorage struct{ doc []byte }

func (f *failingStorage) Read(string) ([]byte, error) { return f.doc, nil }
func (f *failingStorage) Write(string, []byte) error  { return errors.New("disk full") }

func TestStorageWriteFailureIsInvalidConfig(t *testing.T) {
	srv := tokenServer(t, nil)
	c, _ := New(Options{
		GitHub: "octocat", Storage: &failingStorage{}, APIBaseURL: srv.URL,
		SignInMethod: SignInPaste, PromptForCode: pasteCode, Stderr: io.Discard, Env: map[string]string{},
	})
	if _, err := c.SignIn(context.Background()); ErrorCodeOf(err) != CodeInvalidConfig {
		t.Errorf("SignIn with failing storage: %v, want invalid_config", err)
	}
	c, _ = New(Options{GitHub: "octocat", Storage: &failingStorage{doc: []byte(`{"v":1,"sessionToken":"sks_a"}`)}, Env: map[string]string{}})
	if err := c.SignOut(context.Background()); ErrorCodeOf(err) != CodeInvalidConfig {
		t.Errorf("SignOut with failing storage: %v, want invalid_config", err)
	}
	// An unwritable directory.
	if runtime.GOOS != "windows" && os.Geteuid() != 0 {
		dir := filepath.Join(t.TempDir(), "ro")
		if err := os.Mkdir(dir, 0o500); err != nil {
			t.Fatal(err)
		}
		c, _ = New(Options{
			GitHub: "octocat", StorageDir: dir, APIBaseURL: srv.URL,
			SignInMethod: SignInPaste, PromptForCode: pasteCode, Stderr: io.Discard, Env: map[string]string{},
		})
		if _, err := c.SignIn(context.Background()); ErrorCodeOf(err) != CodeInvalidConfig {
			t.Errorf("SignIn into a read-only dir: %v, want invalid_config", err)
		}
	}
}

func TestRefreshWritesBackOnlyIfTokenUnchanged(t *testing.T) {
	var c *Client
	swap := func() {
		_ = c.store().update(func(f *storageFile) *storageFile {
			f.SessionToken = strPtr("sks_other")
			f.Cache = nil
			return f
		})
	}
	// 200 with a renewed token while another instance replaced the session.
	srv := tokenServer(t, func(w http.ResponseWriter, r *http.Request) {
		swap()
		w.Header().Set("Sponsorkit-Session", "sks_renewed")
		_, _ = io.WriteString(w, robustResultJSON)
	})
	c, _ = New(Options{GitHub: "octocat", StorageDir: t.TempDir(), APIBaseURL: srv.URL, Env: map[string]string{}})
	_ = c.store().backend.Write(c.hash, []byte(`{"v":1,"sessionToken":"sks_a"}`))
	if _, err := c.GetFinancialContribution(context.Background()); err != nil {
		t.Fatal(err)
	}
	f := c.store().read()
	if f.token() != "sks_other" || f.Cache != nil {
		t.Errorf("refresh overwrote a session replaced meanwhile: token %q, cache %v", f.token(), f.Cache != nil)
	}

	// 401 clears only the token the request used.
	srv = tokenServer(t, func(w http.ResponseWriter, r *http.Request) {
		swap()
		w.WriteHeader(http.StatusUnauthorized)
	})
	c, _ = New(Options{GitHub: "octocat", StorageDir: t.TempDir(), APIBaseURL: srv.URL, Env: map[string]string{}})
	_ = c.store().backend.Write(c.hash, []byte(`{"v":1,"sessionToken":"sks_a"}`))
	_, _ = c.GetFinancialContribution(context.Background())
	if got := c.store().read().token(); got != "sks_other" {
		t.Errorf("a 401 for sks_a cleared the newer token: %q", got)
	}

	// Unchanged token: the renewed token and cache are written back.
	srv = tokenServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Sponsorkit-Session", "sks_renewed")
		_, _ = io.WriteString(w, robustResultJSON)
	})
	c, _ = New(Options{GitHub: "octocat", StorageDir: t.TempDir(), APIBaseURL: srv.URL, Env: map[string]string{}})
	_ = c.store().backend.Write(c.hash, []byte(`{"v":1,"sessionToken":"sks_a"}`))
	_, _ = c.GetFinancialContribution(context.Background())
	if f := c.store().read(); f.token() != "sks_renewed" || f.Cache == nil {
		t.Errorf("unchanged token: token %q, cache %v", f.token(), f.Cache != nil)
	}
}

func TestRelativeHomeIsNoConfigDir(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("HOME/XDG_CONFIG_HOME resolution is Linux-specific")
	}
	t.Setenv("XDG_CONFIG_HOME", "")
	t.Setenv("HOME", "relative-home")
	if d, err := DefaultStorageDir(); err == nil {
		t.Errorf("DefaultStorageDir with a relative HOME = %q; must not resolve against the cwd", d)
	}
	t.Setenv("HOME", "")
	if _, err := DefaultStorageDir(); err == nil {
		t.Error("DefaultStorageDir with HOME unset must fail")
	}
	t.Cleanup(ResetProcessState)
	c, err := New(Options{GitHub: "octocat", Env: map[string]string{}})
	if err != nil {
		t.Fatalf("construction must not fail without a config dir: %v", err)
	}
	if _, ok := c.store().backend.(*memoryStorage); !ok {
		t.Errorf("backend = %T, want in-memory", c.store().backend)
	}
}
