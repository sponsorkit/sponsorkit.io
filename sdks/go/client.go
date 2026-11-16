package sponsorkit

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Version is the SDK version.
const Version = "0.1.0"

// DefaultAPIBaseURL is the Sponsorkit API origin.
const DefaultAPIBaseURL = "https://sponsorkit.io"

const (
	defaultCacheTTL        = time.Hour
	minCacheTTL            = time.Minute
	defaultPollInterval    = time.Minute
	defaultCheckoutTimeout = 10 * time.Minute
	loopbackTimeout        = 5 * time.Minute
	defaultRetryAfter      = 60 * time.Second
	maxAppNameLength       = 64
)

// SignInMethod selects the native sign-in flow (PROTOCOL §7).
type SignInMethod string

// Sign-in methods.
const (
	// SignInAuto tries loopback and falls back to paste when there is no
	// display, SSH_CONNECTION is set or the browser cannot be opened.
	SignInAuto SignInMethod = "auto"
	// SignInLoopback listens on 127.0.0.1 and opens the system browser.
	SignInLoopback SignInMethod = "loopback"
	// SignInPaste prints a URL and reads the code the user pastes back.
	SignInPaste SignInMethod = "paste"
)

// Options configures a Client. At least one of GitHub and OpenCollective is
// required.
type Options struct {
	// GitHub is the GitHub login that receives sponsorships.
	GitHub string
	// OpenCollective is the Open Collective slug that receives contributions.
	OpenCollective string
	// AppName is shown on the consent page as "says it is" (max 64 characters).
	AppName string
	// CacheTTL is how long a fetched result is served from the local cache
	// without calling the API. Zero means one hour; values below one minute
	// are raised to one minute. Use WithCacheTTL per call to force a refresh.
	CacheTTL time.Duration
	// Mock enables mock mode (SPEC §7.4): see MockPreset and MockContributions.
	// It takes precedence over the SPONSORKIT_MOCK environment variable.
	Mock *Mock
	// StorageDir is the directory for the local state file. Defaults to
	// DefaultStorageDir(). Ignored when Storage is set.
	StorageDir string
	// Storage replaces the file storage entirely.
	Storage Storage
	// APIBaseURL overrides the API origin (self-hosting, tests).
	APIBaseURL string
	// HTTPClient is used for all API calls. Defaults to a client with a 30 s timeout.
	HTTPClient *http.Client

	// OpenBrowser opens a URL for the user. Defaults to OpenSystemBrowser.
	OpenBrowser func(ctx context.Context, url string) error
	// PromptForCode asks the user for the paste-back sign-in code. It receives
	// the URL the user must open. Defaults to PromptStdin.
	PromptForCode func(ctx context.Context, url string) (string, error)
	// SignInMethod forces a sign-in flow. Defaults to SignInAuto.
	SignInMethod SignInMethod
	// Env overrides the process environment for SPONSORKIT_DISABLE,
	// SPONSORKIT_MOCK, SPONSORKIT_NO_NAG, CI and the display detection of
	// SignInAuto. When nil, the process environment is used.
	Env map[string]string
	// DevChecks forces the dev-time target existence check on or off. By
	// default it runs for binaries built by `go run` / `go test`.
	DevChecks *bool
	// CheckoutPollInterval is how often OpenCheckout polls. Defaults to 60 s.
	CheckoutPollInterval time.Duration
	// Clock returns the current time (cache TTL, nag). Defaults to time.Now.
	Clock func() time.Time
	// Stderr receives user-facing messages such as the paste-back URL.
	// Defaults to os.Stderr.
	Stderr io.Writer
	// Interactive overrides the TTY detection used by Nag.
	Interactive *bool
}

// Client is a Sponsorkit client for one target set. It is safe for concurrent use.
type Client struct {
	targets       []target
	param         string
	hash          string
	apiBaseURL    string
	appName       string
	cacheTTL      time.Duration
	pollInterval  time.Duration
	disabled      bool
	devChecks     bool
	signInMethod  SignInMethod
	env           func(string) string
	httpClient    *http.Client
	openBrowser   func(ctx context.Context, url string) error
	customBrowser bool
	promptForCode func(ctx context.Context, url string) (string, error)
	now           func() time.Time
	stderr        io.Writer
	interactive   *bool
	storageOpt    Storage
	storageDir    string

	mu        sync.Mutex
	mock      *mockState
	mockNags  *store
	storeOnce sync.Once
	st        *store
}

// processState is per-process memo state (PROTOCOL §7 "restart").
var processState = struct {
	sync.Mutex
	nagCounted map[string]bool
	devChecks  map[string]*devCheckEntry
	retryUntil map[string]time.Time
}{
	nagCounted: map[string]bool{},
	devChecks:  map[string]*devCheckEntry{},
	retryUntil: map[string]time.Time{},
}

type devCheckEntry struct {
	once sync.Once
	err  error
}

// ResetProcessState forgets per-process memo state: the nag runs already
// counted, the dev-check memo and the Retry-After memo. It simulates a new
// process and is meant for tests.
func ResetProcessState() {
	processState.Lock()
	defer processState.Unlock()
	processState.nagCounted = map[string]bool{}
	processState.devChecks = map[string]*devCheckEntry{}
	processState.retryUntil = map[string]time.Time{}
}

// New creates a Client. It returns an invalid_config *Error for missing or
// malformed targets, an unknown mock preset or other invalid options. It does
// no I/O.
func New(opts Options) (*Client, error) {
	ts, err := canonicalTargets(Targets{GitHub: opts.GitHub, OpenCollective: opts.OpenCollective})
	if err != nil {
		return nil, err
	}
	c := &Client{
		targets:       ts,
		param:         targetsParamOf(ts),
		appName:       opts.AppName,
		storageOpt:    opts.Storage,
		storageDir:    opts.StorageDir,
		openBrowser:   opts.OpenBrowser,
		promptForCode: opts.PromptForCode,
		now:           opts.Clock,
		stderr:        opts.Stderr,
		interactive:   opts.Interactive,
		httpClient:    opts.HTTPClient,
	}
	c.hash = hashParam(c.param)
	if len(c.appName) > maxAppNameLength {
		return nil, newError(CodeInvalidConfig, "appName must be at most 64 characters", nil)
	}
	if c.apiBaseURL, err = normalizeBaseURL(opts.APIBaseURL); err != nil {
		return nil, err
	}
	switch {
	case opts.CacheTTL < 0:
		return nil, newError(CodeInvalidConfig, "CacheTTL must not be negative", nil)
	case opts.CacheTTL == 0:
		c.cacheTTL = defaultCacheTTL
	case opts.CacheTTL < minCacheTTL:
		c.cacheTTL = minCacheTTL
	default:
		c.cacheTTL = opts.CacheTTL
	}
	switch {
	case opts.CheckoutPollInterval < 0:
		return nil, newError(CodeInvalidConfig, "CheckoutPollInterval must not be negative", nil)
	case opts.CheckoutPollInterval == 0:
		c.pollInterval = defaultPollInterval
	default:
		c.pollInterval = opts.CheckoutPollInterval
	}
	switch opts.SignInMethod {
	case "", SignInAuto:
		c.signInMethod = SignInAuto
	case SignInLoopback, SignInPaste:
		c.signInMethod = opts.SignInMethod
	default:
		return nil, newError(CodeInvalidConfig, fmt.Sprintf("unknown SignInMethod %q", opts.SignInMethod), nil)
	}
	if opts.Env != nil {
		env := opts.Env
		c.env = func(k string) string { return env[k] }
	} else {
		c.env = os.Getenv
	}
	if c.httpClient == nil {
		c.httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	if c.openBrowser == nil {
		c.openBrowser = OpenSystemBrowser
	} else {
		c.customBrowser = true
	}
	if c.promptForCode == nil {
		c.promptForCode = PromptStdin
	}
	if c.now == nil {
		c.now = time.Now
	}
	if c.stderr == nil {
		c.stderr = os.Stderr
	}
	if opts.DevChecks != nil {
		c.devChecks = *opts.DevChecks
	} else {
		c.devChecks = defaultDevChecks()
	}
	c.disabled = envSet(c.env("SPONSORKIT_DISABLE"))
	mock := opts.Mock
	if mock == nil {
		if name := strings.TrimSpace(c.env("SPONSORKIT_MOCK")); name != "" {
			mock = MockPreset(name)
		}
	}
	if mock != nil {
		state, err := initialMockState(ts, mock)
		if err != nil {
			return nil, err
		}
		if !c.disabled {
			c.mock = state
			c.mockNags = &store{backend: &memoryStorage{}, key: c.hash, lock: &sync.Mutex{}}
		}
	}
	return c, nil
}

func normalizeBaseURL(raw string) (string, error) {
	if raw == "" {
		return DefaultAPIBaseURL, nil
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", newError(CodeInvalidConfig, fmt.Sprintf("invalid APIBaseURL %q", raw), err)
	}
	return u.Scheme + "://" + u.Host + strings.TrimRight(u.Path, "/"), nil
}

// Targets returns the canonical target strings, e.g. ["github:octocat"].
func (c *Client) Targets() []string { return targetStrings(c.targets) }

// TargetsParam returns the canonical target param used in URLs.
func (c *Client) TargetsParam() string { return c.param }

// Disabled reports whether SPONSORKIT_DISABLE is set for this client.
func (c *Client) Disabled() bool { return c.disabled }

// IsMock reports whether the client is in mock mode.
func (c *Client) IsMock() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.mock != nil
}

func (c *Client) store() *store {
	c.storeOnce.Do(func() {
		backend := c.storageOpt
		if backend == nil {
			dir := c.storageDir
			if dir == "" {
				if d, err := DefaultStorageDir(); err == nil {
					dir = d
				} else {
					dir = ".sponsorkit"
				}
			}
			backend = &DirStorage{Dir: dir}
		}
		c.st = newStore(backend, c.hash)
	})
	return c.st
}

func (c *Client) mockSnapshot() (*mockState, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.mock == nil {
		return nil, false
	}
	cp := &mockState{signedIn: c.mock.signedIn, contributions: append([]Contribution(nil), c.mock.contributions...)}
	return cp, true
}

// IsSignedIn reports whether a session token is stored. It makes no request.
func (c *Client) IsSignedIn() bool {
	if c.disabled {
		return false
	}
	if m, ok := c.mockSnapshot(); ok {
		return m.signedIn
	}
	return c.store().read().token() != ""
}

// SessionToken returns the stored session token (sks_…) so it can be
// forwarded to a backend that calls VerifySession. It returns "" when signed
// out, disabled or in mock mode.
func (c *Client) SessionToken() string {
	if c.disabled {
		return ""
	}
	if _, ok := c.mockSnapshot(); ok {
		return ""
	}
	return c.store().read().token()
}

// GetOption customizes one GetFinancialContribution call.
type GetOption func(*getConfig)

type getConfig struct {
	cacheTTL *time.Duration
}

// WithCacheTTL overrides the client's CacheTTL for one call. Zero always
// refreshes (unless a Retry-After from the API is still in force).
func WithCacheTTL(d time.Duration) GetOption {
	return func(g *getConfig) { g.cacheTTL = &d }
}

// GetFinancialContribution reports what the current user has contributed to
// the targets. It never returns an error for network or server problems: it
// serves the cache, or a stale signed-in result when nothing is cached
// (SPEC §7.2). The only error is invalid_config from the dev-time target
// existence check.
func (c *Client) GetFinancialContribution(ctx context.Context, opts ...GetOption) (*Result, error) {
	if c.disabled {
		return c.emptyResult(func(r *Result) { r.Disabled = true }), nil
	}
	if m, ok := c.mockSnapshot(); ok {
		return mockResult(c.targets, m), nil
	}
	if err := c.devCheck(ctx); err != nil {
		return nil, err
	}
	g := getConfig{}
	for _, o := range opts {
		o(&g)
	}
	ttl := c.cacheTTL
	if g.cacheTTL != nil {
		ttl = *g.cacheTTL
	}
	return c.refresh(ctx, ttl), nil
}

func (c *Client) emptyResult(mod func(*Result)) *Result {
	r := &Result{Targets: c.Targets(), Contributions: []Contribution{}}
	if mod != nil {
		mod(r)
	}
	return r
}

func (c *Client) memoKey() string { return c.apiBaseURL + "|" + c.param }

// refresh implements the cache and error contract (SPEC §7.2, PROTOCOL §7.1).
func (c *Client) refresh(ctx context.Context, ttl time.Duration) *Result {
	st := c.store()
	stored := st.read()
	token := stored.token()
	if token == "" {
		return c.emptyResult(nil)
	}
	cache := stored.Cache
	now := c.now()
	if cache != nil && ttl > 0 {
		if at, ok := parseISOTime(cache.StoredAt); ok && now.Sub(at) < ttl {
			r := cache.Result.clone()
			r.FromCache = true
			return r
		}
	}
	fallback := func() *Result {
		if cache != nil {
			r := cache.Result.clone()
			r.FromCache, r.Stale = true, true
			return r
		}
		return c.emptyResult(func(r *Result) { r.SignedIn, r.Stale = true, true })
	}
	processState.Lock()
	until := processState.retryUntil[c.memoKey()]
	processState.Unlock()
	if now.Before(until) {
		return fallback()
	}

	res := fetchContributions(ctx, c.httpClient, c.apiBaseURL, token)
	switch res.kind {
	case fetchSessionInvalid:
		_ = st.update(func(f *storageFile) *storageFile {
			if f.token() != token {
				return nil
			}
			return &storageFile{V: 1, Nags: f.Nags}
		})
		return c.emptyResult(nil)
	case fetchRateLimited:
		processState.Lock()
		processState.retryUntil[c.memoKey()] = c.now().Add(res.retryAfter)
		processState.Unlock()
		return fallback()
	case fetchFailed:
		return fallback()
	}
	result := res.result
	result.FromCache = false
	if len(result.Unavailable) > 0 {
		result.Stale = true
		if cache != nil {
			have := map[string]bool{}
			for _, ct := range result.Contributions {
				have[ct.ID] = true
			}
			for _, ct := range cache.Result.Contributions {
				if !have[ct.ID] && containsProvider(result.Unavailable, ct.Provider) {
					result.Contributions = append(result.Contributions, ct)
				}
			}
		}
	}
	renewed := res.renewedToken
	storedAt := isoTime(c.now())
	_ = st.update(func(f *storageFile) *storageFile {
		cur := f.token()
		if cur != token && (renewed == "" || cur != renewed) {
			return nil // another instance signed out or replaced the session meanwhile
		}
		if renewed != "" {
			f.SessionToken = strPtr(renewed)
		}
		f.Cache = &cacheEntry{Result: *result.clone(), StoredAt: storedAt}
		return f
	})
	return result
}

func containsProvider(ps []Provider, p Provider) bool {
	for _, x := range ps {
		if x == p {
			return true
		}
	}
	return false
}

// SignOut deletes the session token and cache locally; there is no
// server-side sign-out. Nag state is kept.
func (c *Client) SignOut(_ context.Context) error {
	if c.disabled {
		return nil
	}
	c.mu.Lock()
	if c.mock != nil {
		c.mock = &mockState{signedIn: false, contributions: []Contribution{}}
		c.mu.Unlock()
		return nil
	}
	c.mu.Unlock()
	st := c.store()
	if !st.exists() {
		return nil
	}
	return st.update(func(f *storageFile) *storageFile {
		if f.SessionToken == nil && f.Cache == nil {
			return nil
		}
		return &storageFile{V: 1, Nags: f.Nags}
	})
}

// devCheck runs the dev-time target existence check once per process.
func (c *Client) devCheck(ctx context.Context) error {
	if !c.devChecks || c.disabled || c.IsMock() {
		return nil
	}
	processState.Lock()
	e, ok := processState.devChecks[c.memoKey()]
	if !ok {
		e = &devCheckEntry{}
		processState.devChecks[c.memoKey()] = e
	}
	processState.Unlock()
	e.once.Do(func() {
		q := url.Values{}
		for _, t := range c.targets {
			q.Set(string(t.provider), t.account)
		}
		infos, ok := fetchTargets(ctx, c.httpClient, c.apiBaseURL, q)
		if !ok {
			return // offline or API error: skip the check
		}
		var missing []string
		for _, t := range infos {
			if !t.Exists {
				missing = append(missing, t.Target)
			}
		}
		if len(missing) > 0 {
			e.err = newError(CodeInvalidConfig, fmt.Sprintf("target(s) %s do not exist or have no sponsorship listing (dev-time check; disable with Options.DevChecks)", strings.Join(missing, ", ")), nil)
		}
	})
	return e.err
}

// ---------------------------------------------------------------- HTTP

type fetchKind int

const (
	fetchOK fetchKind = iota
	fetchSessionInvalid
	fetchRateLimited
	fetchFailed
)

type fetchResult struct {
	kind         fetchKind
	result       *Result
	renewedToken string
	retryAfter   time.Duration
	status       int
	err          error
}

func newRequest(ctx context.Context, method, u string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, u, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "sponsorkit-go/"+Version)
	return req, nil
}

func fetchContributions(ctx context.Context, hc *http.Client, base, token string) fetchResult {
	req, err := newRequest(ctx, http.MethodGet, base+"/api/v1/contributions", nil)
	if err != nil {
		return fetchResult{kind: fetchFailed, err: err}
	}
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := hc.Do(req)
	if err != nil {
		return fetchResult{kind: fetchFailed, err: err}
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	switch {
	case res.StatusCode == http.StatusUnauthorized:
		return fetchResult{kind: fetchSessionInvalid, status: res.StatusCode}
	case res.StatusCode == http.StatusTooManyRequests:
		return fetchResult{kind: fetchRateLimited, status: res.StatusCode, retryAfter: parseRetryAfter(res.Header.Get("Retry-After"), time.Now())}
	case res.StatusCode != http.StatusOK || err != nil:
		return fetchResult{kind: fetchFailed, status: res.StatusCode, err: err}
	}
	var r Result
	if err := json.Unmarshal(body, &r); err != nil || r.Targets == nil {
		return fetchResult{kind: fetchFailed, status: res.StatusCode, err: err}
	}
	if r.Contributions == nil {
		r.Contributions = []Contribution{}
	}
	return fetchResult{kind: fetchOK, result: &r, renewedToken: strings.TrimSpace(res.Header.Get("Sponsorkit-Session")), status: res.StatusCode}
}

func parseRetryAfter(v string, now time.Time) time.Duration {
	v = strings.TrimSpace(v)
	if v == "" {
		return defaultRetryAfter
	}
	if n, err := strconv.ParseFloat(v, 64); err == nil && n >= 0 {
		return time.Duration(n * float64(time.Second))
	}
	if t, err := http.ParseTime(v); err == nil {
		if d := t.Sub(now); d > 0 {
			return d
		}
		return 0
	}
	return defaultRetryAfter
}

type targetInfo struct {
	Target string `json:"target"`
	Exists bool   `json:"exists"`
}

func fetchTargets(ctx context.Context, hc *http.Client, base string, q url.Values) ([]targetInfo, bool) {
	req, err := newRequest(ctx, http.MethodGet, base+"/api/v1/targets?"+q.Encode(), nil)
	if err != nil {
		return nil, false
	}
	res, err := hc.Do(req)
	if err != nil {
		return nil, false
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, false
	}
	var body struct {
		Targets []targetInfo `json:"targets"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 4<<20)).Decode(&body); err != nil {
		return nil, false
	}
	return body.Targets, true
}

// problemCode extracts the `code` of an application/problem+json body.
func problemCode(body []byte) string {
	var p struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(body, &p)
	return p.Code
}
