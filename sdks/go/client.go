package sponsorkit

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
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

// DefaultAPIBaseURL is the Sponsorkit API origin, used for every API call
// (/api/v1/...).
const DefaultAPIBaseURL = "https://api.sponsorkit.io"

// DefaultSiteBaseURL is the Sponsorkit site (origin plus base path), used for
// every page URL: /connect/, /checkout/ and CheckoutURL.
const DefaultSiteBaseURL = "https://sponsorkit.github.io/sponsorkit.io"

// Page paths on the site. Always the trailing-slash form (PROTOCOL §7).
const (
	connectPath  = "/connect/"
	checkoutPath = "/checkout/"
)

const (
	defaultCacheTTL        = time.Hour
	minCacheTTL            = time.Minute
	defaultPollInterval    = time.Minute
	defaultCheckoutTimeout = 10 * time.Minute
	defaultSignInTimeout   = 5 * time.Minute
	defaultRetryAfter      = 60 * time.Second
	defaultRequestTimeout  = 30 * time.Second
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
	// Mock enables mock mode: see MockPreset and MockContributions.
	// It takes precedence over the SPONSORKIT_MOCK environment variable.
	Mock *Mock
	// StorageDir is the directory for the local state file. Defaults to
	// DefaultStorageDir(). Ignored when Storage is set. If DefaultStorageDir
	// fails (for example HOME and XDG_CONFIG_HOME are both unset) and no
	// StorageDir is given, state is kept in process memory only: nothing is
	// written to disk, so a sign-in does not outlive the process.
	StorageDir string
	// Storage replaces the file storage entirely.
	Storage Storage
	// APIBaseURL overrides the API origin used for API calls (self-hosting,
	// tests). Defaults to DefaultAPIBaseURL. Trailing slashes are trimmed.
	APIBaseURL string
	// SiteBaseURL overrides the site base URL (origin plus optional base path)
	// used for the /connect/ and /checkout/ pages, CheckoutURL and the loopback
	// redirect after a checkout sign-in. When empty it defaults to APIBaseURL if
	// that is set (single-origin self-hosting, tests), else to
	// DefaultSiteBaseURL. Trailing slashes are trimmed.
	SiteBaseURL string
	// HTTPClient is used for all API calls. Defaults to http.DefaultClient's
	// transport; RequestTimeout applies whichever client is used.
	HTTPClient *http.Client
	// RequestTimeout bounds every HTTP request, including reading the
	// response body (PROTOCOL §7.0). Zero means 30 s; NoRequestTimeout (or any
	// negative value) disables it. A timeout counts as a network error:
	// GetFinancialContribution serves the stale cache and SignIn returns
	// network_error.
	RequestTimeout time.Duration

	// OpenBrowser opens a URL for the user. Defaults to OpenSystemBrowser.
	// It runs concurrently with the loopback wait, so it may block; its ctx
	// ends when the sign-in fails, is cancelled or times out, but not when the
	// sign-in succeeds (the browser may still be following a redirect). An
	// error makes SignInAuto fall back to paste-back.
	OpenBrowser func(ctx context.Context, url string) error
	// PromptForCode asks the user for the paste-back sign-in code. It receives
	// the URL the user must open. Defaults to PromptStdin.
	PromptForCode func(ctx context.Context, url string) (string, error)
	// SignInMethod forces a sign-in flow. Defaults to SignInAuto.
	SignInMethod SignInMethod
	// SignInTimeout bounds how long SignIn (and the sign-in phase of
	// OpenCheckout) waits for the user to finish signing in, with the loopback
	// or the paste-back flow. Exceeding it returns a timeout *Error. Defaults to
	// 5 minutes.
	SignInTimeout time.Duration
	// Env overrides the process environment for SPONSORKIT_DISABLE,
	// SPONSORKIT_MOCK, SPONSORKIT_NO_NAG, SPONSORKIT_DEV_CHECKS, CI and the
	// display detection of SignInAuto. When non-nil it replaces the process
	// environment for these variables (it is not merged): a variable missing
	// from the map counts as unset. When nil, the process environment is used.
	Env map[string]string
	// DevChecks forces the dev-time target existence check on or off. By
	// default it is on only when SPONSORKIT_DEV_CHECKS is set (see Env); Go has
	// no implicit development signal.
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

// NoRequestTimeout disables Options.RequestTimeout and WithRequestTimeout.
// (The protocol's requestTimeout of 0 disables the timeout; in Go the zero
// value selects the 30 s default instead.)
const NoRequestTimeout time.Duration = -1

// requestTimeoutOf maps the RequestTimeout option to the effective timeout:
// 0 means none.
func requestTimeoutOf(d time.Duration) time.Duration {
	switch {
	case d == 0:
		return defaultRequestTimeout
	case d < 0:
		return 0
	}
	return d
}

// Client is a Sponsorkit client for one target set. It is safe for concurrent use.
type Client struct {
	targets       []target
	param         string
	hash          string
	apiBaseURL    string
	siteBaseURL   string
	appName       string
	cacheTTL      time.Duration
	pollInterval  time.Duration
	signInTimeout time.Duration
	disabled      bool
	devChecks     bool
	signInMethod  SignInMethod
	env           func(string) string
	httpClient    *http.Client
	reqTimeout    time.Duration
	openBrowser   func(ctx context.Context, url string) error
	customBrowser bool
	promptForCode func(ctx context.Context, url string) (string, error)
	now           func() time.Time
	stderr        io.Writer
	interactive   *bool
	storageOpt    Storage
	storageDir    string

	mu       sync.Mutex
	mock     *mockState
	mockNags *store
	// mockCounted records the nag runs this mock instance already counted
	// (mock nag state lives in memory, per instance: PROTOCOL §7.1 item 14).
	mockCounted map[string]bool
	storeOnce   sync.Once
	st          *store
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

// defaultStorageDir is DefaultStorageDir; tests replace it.
var defaultStorageDir = DefaultStorageDir

// memFallback is the process-wide in-memory storage used when there is no
// per-user config directory.
var memFallback struct {
	sync.Mutex
	s *memoryStorage
}

func processMemoryStorage() *memoryStorage {
	memFallback.Lock()
	defer memFallback.Unlock()
	if memFallback.s == nil {
		memFallback.s = &memoryStorage{}
	}
	return memFallback.s
}

type devCheckEntry struct {
	once sync.Once
	err  error
}

// ResetProcessState forgets per-process memo state: the nag runs already
// counted, the dev-check memo, the Retry-After memo and the in-memory state
// used when there is no per-user config directory. It simulates a new
// process and is meant for tests.
func ResetProcessState() {
	processState.Lock()
	defer processState.Unlock()
	processState.nagCounted = map[string]bool{}
	processState.devChecks = map[string]*devCheckEntry{}
	processState.retryUntil = map[string]time.Time{}
	memFallback.Lock()
	memFallback.s = nil
	memFallback.Unlock()
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
		reqTimeout:    requestTimeoutOf(opts.RequestTimeout),
	}
	c.hash = hashParam(c.param)
	if len(c.appName) > maxAppNameLength {
		return nil, newError(CodeInvalidConfig, "appName must be at most 64 characters", nil)
	}
	if c.apiBaseURL, c.siteBaseURL, err = resolveBaseURLs(opts.APIBaseURL, opts.SiteBaseURL); err != nil {
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
	switch {
	case opts.SignInTimeout < 0:
		return nil, newError(CodeInvalidConfig, "SignInTimeout must not be negative", nil)
	case opts.SignInTimeout == 0:
		c.signInTimeout = defaultSignInTimeout
	default:
		c.signInTimeout = opts.SignInTimeout
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
		c.httpClient = &http.Client{}
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
		c.devChecks = envSet(c.env("SPONSORKIT_DEV_CHECKS"))
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
			c.mockCounted = map[string]bool{}
		}
	}
	return c, nil
}

// normalizeBaseURL validates the API base URL; empty means DefaultAPIBaseURL.
func normalizeBaseURL(raw string) (string, error) {
	if raw == "" {
		return DefaultAPIBaseURL, nil
	}
	return parseBaseURL("APIBaseURL", raw)
}

// resolveBaseURLs applies the PROTOCOL §7 defaulting rule: an empty option is
// unset; the site falls back to the API base URL when only that is set, and
// otherwise to DefaultSiteBaseURL.
func resolveBaseURLs(apiRaw, siteRaw string) (api, site string, err error) {
	if api, err = normalizeBaseURL(apiRaw); err != nil {
		return "", "", err
	}
	switch {
	case siteRaw != "":
		if site, err = parseBaseURL("SiteBaseURL", siteRaw); err != nil {
			return "", "", err
		}
	case apiRaw != "":
		site = api
	default:
		site = DefaultSiteBaseURL
	}
	return api, site, nil
}

// parseBaseURL validates and normalizes a base URL (an origin plus an
// optional base path) for the option called name.
//
// It applies the same normalization as the other SDKs (WHATWG URL style):
// leading and trailing C0 controls and spaces are ignored, the scheme and host
// are lowercased, a default port (:80 for http, :443 for https) is dropped,
// dot segments are resolved, the path keeps its percent-encoding, and trailing
// slashes are trimmed. Credentials, a query or a fragment are rejected with
// CodeInvalidConfig, as is anything that is not an absolute http(s) URL.
func parseBaseURL(name, raw string) (string, error) {
	invalid := func(err error) (string, error) {
		return "", newError(CodeInvalidConfig, fmt.Sprintf("invalid %s %q", name, raw), err)
	}
	u, err := url.Parse(strings.TrimFunc(raw, func(r rune) bool { return r <= 0x20 }))
	if err != nil {
		return invalid(err)
	}
	scheme := strings.ToLower(u.Scheme)
	if (scheme != "http" && scheme != "https") || u.Opaque != "" || u.Host == "" {
		return invalid(nil)
	}
	if u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return "", newError(CodeInvalidConfig,
			fmt.Sprintf("%s must be an origin plus an optional path (no credentials, query or fragment): %q", name, raw), nil)
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return invalid(nil)
	}
	if strings.Contains(host, ":") {
		host = "[" + host + "]" // IPv6 literal
	}
	if port := u.Port(); port != "" {
		n, perr := strconv.Atoi(port)
		if perr != nil || n > 65535 {
			return invalid(perr)
		}
		if !(scheme == "http" && n == 80) && !(scheme == "https" && n == 443) {
			host += ":" + strconv.Itoa(n)
		}
	}
	return scheme + "://" + host + strings.TrimRight(removeDotSegments(u.EscapedPath()), "/"), nil
}

// removeDotSegments resolves "." and ".." segments (including their
// percent-encoded forms) in an escaped absolute path, as WHATWG URL parsing does.
func removeDotSegments(p string) string {
	if p == "" {
		return ""
	}
	segs := strings.Split(strings.TrimPrefix(p, "/"), "/")
	out := make([]string, 0, len(segs))
	for i, s := range segs {
		last := i == len(segs)-1
		switch strings.ToLower(s) {
		case ".", "%2e":
			if last {
				out = append(out, "")
			}
		case "..", ".%2e", "%2e.", "%2e%2e":
			if len(out) > 0 {
				out = out[:len(out)-1]
			}
			if last {
				out = append(out, "")
			}
		default:
			out = append(out, s)
		}
	}
	return "/" + strings.Join(out, "/")
}

// siteURL returns <siteBaseURL><path>?<q>.
func (c *Client) siteURL(path string, q url.Values) string {
	return c.siteBaseURL + path + "?" + q.Encode()
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
				if d, err := defaultStorageDir(); err == nil {
					dir = d
				}
			}
			if dir != "" {
				backend = &DirStorage{Dir: dir}
			} else {
				// No per-user config directory (e.g. HOME unset): never fall
				// back to a cwd-relative path. Keep state in process memory.
				backend = processMemoryStorage()
			}
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
// serves the cache, or a stale signed-in result when nothing is cached. The
// only error is invalid_config from the dev-time target
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

// refresh implements the cache and error contract (PROTOCOL §7.1).
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

	res := fetchContributions(ctx, c.httpClient, c.reqTimeout, c.apiBaseURL, token)
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
		if f.token() != token {
			// PROTOCOL §7.0: another instance signed out, signed in again or
			// renewed the session meanwhile; keep what it stored.
			return nil
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
// server-side sign-out. Nag state is kept. It returns invalid_config when the
// storage cannot be written.
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
	if err := st.update(func(f *storageFile) *storageFile {
		if f.SessionToken == nil && f.Cache == nil {
			return nil
		}
		return &storageFile{V: 1, Nags: f.Nags}
	}); err != nil {
		return newError(CodeInvalidConfig, "could not clear the stored session", err)
	}
	return nil
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
		infos, ok := fetchTargets(ctx, c.httpClient, c.reqTimeout, c.apiBaseURL, q)
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
	// retryAfterSent reports whether the API sent a usable Retry-After header.
	retryAfterSent bool
	status         int
	err            error
}

// httpResponse is a fully read API response.
type httpResponse struct {
	status int
	header http.Header
	body   []byte
}

// doHTTP sends one API request and reads its body, all within timeout (0
// means none). Any transport, timeout or body read failure is an error.
func doHTTP(ctx context.Context, hc *http.Client, timeout time.Duration, method, u string, body []byte, header map[string]string) (*httpResponse, error) {
	if timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}
	var rd io.Reader
	if body != nil {
		rd = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, rd)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "sponsorkit-go/"+Version)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	res, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	b, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	return &httpResponse{status: res.StatusCode, header: res.Header, body: b}, nil
}

func fetchContributions(ctx context.Context, hc *http.Client, timeout time.Duration, base, token string) fetchResult {
	res, err := doHTTP(ctx, hc, timeout, http.MethodGet, base+"/api/v1/contributions", nil,
		map[string]string{"Authorization": "Bearer " + token})
	if err != nil {
		return fetchResult{kind: fetchFailed, err: err}
	}
	switch {
	case res.status == http.StatusUnauthorized:
		return fetchResult{kind: fetchSessionInvalid, status: res.status}
	case res.status == http.StatusTooManyRequests:
		ra, sent := parseRetryAfter(res.header.Get("Retry-After"), time.Now())
		return fetchResult{kind: fetchRateLimited, status: res.status, retryAfter: ra, retryAfterSent: sent}
	case res.status != http.StatusOK:
		// PROTOCOL §7: Retry-After is reported on any unexpected response,
		// not only 429. VerifySession surfaces it; the client ignores it.
		ra, sent := parseRetryAfter(res.header.Get("Retry-After"), time.Now())
		return fetchResult{kind: fetchFailed, status: res.status, retryAfter: ra, retryAfterSent: sent}
	}
	var r Result
	if err := json.Unmarshal(res.body, &r); err != nil || r.Targets == nil {
		return fetchResult{kind: fetchFailed, status: res.status, err: err}
	}
	if r.Contributions == nil {
		r.Contributions = []Contribution{}
	}
	return fetchResult{kind: fetchOK, result: &r, renewedToken: strings.TrimSpace(res.header.Get("Sponsorkit-Session")), status: res.status}
}

// maxRetryAfter caps a parsed Retry-After so that huge values cannot overflow
// time.Duration (which would put the back-off in the past).
const maxRetryAfter = 24 * time.Hour

// parseRetryAfter parses a Retry-After header (seconds or an HTTP date),
// capped at maxRetryAfter. The boolean is false, and the duration
// defaultRetryAfter, when the header is missing or malformed ("Inf" and "NaN"
// are malformed).
func parseRetryAfter(v string, now time.Time) (time.Duration, bool) {
	v = strings.TrimSpace(v)
	if v == "" {
		return defaultRetryAfter, false
	}
	if n, err := strconv.ParseFloat(v, 64); err == nil && n >= 0 && !math.IsInf(n, 0) && !math.IsNaN(n) {
		if n >= maxRetryAfter.Seconds() {
			return maxRetryAfter, true
		}
		return time.Duration(n * float64(time.Second)), true
	}
	if t, err := http.ParseTime(v); err == nil {
		if d := t.Sub(now); d > 0 {
			return min(d, maxRetryAfter), true
		}
		return 0, true
	}
	return defaultRetryAfter, false
}

type targetInfo struct {
	Target string `json:"target"`
	Exists bool   `json:"exists"`
}

func fetchTargets(ctx context.Context, hc *http.Client, timeout time.Duration, base string, q url.Values) ([]targetInfo, bool) {
	res, err := doHTTP(ctx, hc, timeout, http.MethodGet, base+"/api/v1/targets?"+q.Encode(), nil, nil)
	if err != nil || res.status != http.StatusOK {
		return nil, false
	}
	var body struct {
		Targets []targetInfo `json:"targets"`
	}
	if err := json.Unmarshal(res.body, &body); err != nil {
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
