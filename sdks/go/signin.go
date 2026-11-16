package sponsorkit

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net"
	"net/http"
	"net/url"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// SignInOptions customizes SignIn.
type SignInOptions struct {
	// Provider skips the provider picker ("github" or "opencollective"). Use it
	// to add a second identity, or to reconnect one flagged NeedsReconnect.
	Provider Provider
	// Method overrides Options.SignInMethod for this call.
	Method SignInMethod
}

// SignIn signs the user in, or adds an identity when already signed in, and
// returns the fresh result. It never prompts implicitly; call it from a user
// action. Pass at most one SignInOptions.
//
// Cancel ctx to abandon the sign-in; Options.SignInTimeout (default 5
// minutes) bounds how long it waits for the user.
//
// Errors: disabled, invalid_config, access_denied, invalid_state and
// provider_error (delivered by the sign-in page), invalid_code (the API
// rejected the code), cancelled (ctx was cancelled or the user abandoned the
// paste-back prompt), timeout (SignInTimeout elapsed) and network_error
// (Sponsorkit could not be reached or answered 5xx, 429 or an unexpected
// response; see Error.RetryAfter).
func (c *Client) SignIn(ctx context.Context, opts ...SignInOptions) (*Result, error) {
	var o SignInOptions
	if len(opts) > 0 {
		o = opts[0]
	}
	if c.disabled {
		return nil, newError(CodeDisabled, "Sponsorkit is disabled (SPONSORKIT_DISABLE)", nil)
	}
	if o.Provider != "" && !c.hasProvider(o.Provider) {
		return nil, newError(CodeInvalidConfig, fmt.Sprintf("no %s target is configured", o.Provider), nil)
	}
	c.mu.Lock()
	if c.mock != nil {
		if !c.mock.signedIn {
			c.mock = &mockState{signedIn: true, contributions: []Contribution{}}
		}
		m := c.mock
		c.mu.Unlock()
		return mockResult(c.targets, m), nil
	}
	c.mu.Unlock()
	if err := c.devCheck(ctx); err != nil {
		return nil, err
	}
	verifier := NewCodeVerifier()
	params := url.Values{}
	params.Set("targets", c.param)
	params.Set("challenge", CodeChallenge(verifier))
	if o.Provider != "" {
		params.Set("provider", string(o.Provider))
	}
	if c.store().read().token() != "" {
		params.Set("add", "1")
	}
	code, err := c.obtainCode(ctx, codeRequest{path: "/connect", params: params, method: o.Method})
	if err != nil {
		return nil, err
	}
	return c.exchange(ctx, code, verifier)
}

func (c *Client) hasProvider(p Provider) bool {
	for _, t := range c.targets {
		if t.provider == p {
			return true
		}
	}
	return false
}

type codeRequest struct {
	path   string // "/connect" or "/checkout"
	params url.Values
	method SignInMethod
	// continueURL is where the loopback callback redirects the browser after
	// receiving a code (checkout).
	continueURL string
}

// effectiveMethod is the per-call method, else the client's.
func (c *Client) effectiveMethod(m SignInMethod) SignInMethod {
	if m == "" || m == SignInAuto {
		return c.signInMethod
	}
	return m
}

func (c *Client) resolveMethod(m SignInMethod) SignInMethod {
	m = c.effectiveMethod(m)
	if m != SignInAuto {
		return m
	}
	if envSet(c.env("SSH_CONNECTION")) {
		return SignInPaste
	}
	if !c.customBrowser && runtime.GOOS != "windows" && runtime.GOOS != "darwin" &&
		c.env("DISPLAY") == "" && c.env("WAYLAND_DISPLAY") == "" {
		return SignInPaste
	}
	return SignInLoopback
}

var (
	errBrowserFailed = errors.New("could not open the browser")
	errSignInTimeout = errors.New("sign-in timed out")
)

// obtainCode waits for the user to sign in and returns the code. The wait is
// bounded by the client's SignInTimeout (timeout) and by ctx (cancelled).
func (c *Client) obtainCode(ctx context.Context, r codeRequest) (string, error) {
	sctx, cancel := context.WithTimeoutCause(ctx, c.signInTimeout, errSignInTimeout)
	defer cancel()
	method := c.resolveMethod(r.method)
	if method == SignInLoopback {
		code, err := c.loopback(ctx, sctx, r, c.effectiveMethod(r.method) == SignInLoopback)
		if !errors.Is(err, errBrowserFailed) {
			return code, err
		}
		// SignInAuto: fall back to paste-back.
	}
	return c.paste(ctx, sctx, r)
}

// waitError is the error for a sign-in wait that ended because sctx is done:
// cancelled when the caller's ctx ended, timeout otherwise.
func (c *Client) waitError(ctx, sctx context.Context) *Error {
	if ctx.Err() != nil {
		return newError(CodeCancelled, "sign-in was cancelled", ctx.Err())
	}
	return newError(CodeTimeout, fmt.Sprintf("sign-in timed out after %s", c.signInTimeout), context.Cause(sctx))
}

func (c *Client) withAppName(q url.Values) url.Values {
	if c.appName != "" {
		q.Set("app_name", c.appName)
	}
	return q
}

func cloneValues(v url.Values) url.Values {
	out := url.Values{}
	for k, vs := range v {
		out[k] = append([]string(nil), vs...)
	}
	return out
}

func (c *Client) paste(ctx, sctx context.Context, r codeRequest) (string, error) {
	q := c.withAppName(cloneValues(r.params))
	q.Set("delivery", "paste")
	u := c.apiBaseURL + r.path + "?" + q.Encode()
	fmt.Fprintf(c.stderr, "To sign in, open this URL on any device:\n\n  %s\n\nthen paste the code shown there (valid for 10 minutes).\n", u)
	code, err := c.promptForCode(sctx, u)
	if sctx.Err() != nil {
		return "", c.waitError(ctx, sctx)
	}
	if err != nil {
		return "", newError(CodeCancelled, "no sign-in code was entered", err)
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return "", newError(CodeCancelled, "no sign-in code was entered", nil)
	}
	return code, nil
}

type callback struct {
	code, err string
}

const closePage = `<!doctype html><html><head><meta charset="utf-8"><title>Sponsorkit</title></head>` +
	`<body style="font-family:system-ui,sans-serif;text-align:center;padding:3em">` +
	`<h1>%s</h1><p>You can close this window and return to the app.</p></body></html>`

// loopback runs the native loopback flow (PROTOCOL §7). When forced is false,
// a failure to open the browser returns errBrowserFailed so that the caller
// can fall back to paste-back.
func (c *Client) loopback(ctx, sctx context.Context, r codeRequest, forced bool) (string, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		if forced {
			return "", newError(CodeNetworkError, "could not listen on 127.0.0.1", err)
		}
		return "", errBrowserFailed
	}
	results := make(chan callback, 1)
	mux := http.NewServeMux()
	mux.HandleFunc("/callback", func(w http.ResponseWriter, req *http.Request) {
		q := req.URL.Query()
		cb := callback{code: q.Get("code"), err: q.Get("error")}
		if cb.code == "" && cb.err == "" {
			http.Error(w, "missing code", http.StatusBadRequest)
			return
		}
		select {
		case results <- cb:
		default:
		}
		if cb.code != "" && r.continueURL != "" {
			http.Redirect(w, req, r.continueURL, http.StatusFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		title := "Signed in"
		if cb.code == "" {
			title = "Sign-in failed: " + html.EscapeString(cb.err)
		}
		fmt.Fprintf(w, closePage, title)
	})
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = srv.Serve(ln) }()
	defer func() {
		sctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Shutdown(sctx)
	}()

	port := ln.Addr().(*net.TCPAddr).Port
	q := c.withAppName(cloneValues(r.params))
	q.Set("delivery", "loopback")
	q.Set("redirect_uri", "http://127.0.0.1:"+strconv.Itoa(port)+"/callback")
	u := c.apiBaseURL + r.path + "?" + q.Encode()
	// PROTOCOL §7.0: the callback is accepted while openBrowser is still
	// running, so the opener runs concurrently with the wait.
	opened := make(chan error, 1)
	go func() { opened <- c.openBrowser(sctx, u) }()

	finish := func(cb callback) (string, error) {
		if cb.code != "" {
			return cb.code, nil
		}
		return "", signInError(cb.err)
	}
	for {
		select {
		case cb := <-results:
			return finish(cb)
		case err := <-opened:
			opened = nil
			if err == nil {
				continue
			}
			select {
			case cb := <-results: // the callback won the race with the failure
				return finish(cb)
			default:
			}
			if !forced {
				return "", errBrowserFailed
			}
			fmt.Fprintf(c.stderr, "Open this URL in your browser to continue:\n\n  %s\n\n", u)
		case <-sctx.Done():
			return "", c.waitError(ctx, sctx)
		}
	}
}

func signInError(code string) *Error {
	switch ErrorCode(code) {
	case CodeAccessDenied, CodeInvalidState, CodeProviderError:
		return newError(ErrorCode(code), "sign-in failed: "+code, nil)
	}
	return newError(CodeProviderError, "sign-in failed: "+code, nil)
}

type tokenResponse struct {
	SessionToken string  `json:"sessionToken"`
	ExpiresAt    string  `json:"expiresAt"`
	Result       *Result `json:"result"`
}

// exchange calls POST /api/v1/auth/token, stores the session token and caches
// the result (PROTOCOL §7.1 item 1).
func (c *Client) exchange(ctx context.Context, code, verifier string) (*Result, error) {
	st := c.store()
	existing := st.read().token()
	var retryAfter string
	post := func(sessionToken string) (int, []byte, error) {
		payload := map[string]string{"code": code, "codeVerifier": verifier}
		if sessionToken != "" {
			payload["sessionToken"] = sessionToken
		}
		b, _ := json.Marshal(payload)
		res, err := doHTTP(ctx, c.httpClient, c.reqTimeout, http.MethodPost, c.apiBaseURL+"/api/v1/auth/token", b,
			map[string]string{"Content-Type": "application/json"})
		if err != nil {
			return 0, nil, err
		}
		retryAfter = res.header.Get("Retry-After")
		return res.status, res.body, nil
	}
	status, body, err := post(existing)
	if err == nil && status == http.StatusUnauthorized && existing != "" {
		// PROTOCOL §7: the stored session is dead. Clear it and retry the same
		// code once without sessionToken, which starts a fresh session.
		_ = st.update(func(f *storageFile) *storageFile {
			if f.token() != existing {
				return nil
			}
			return &storageFile{V: 1, Nags: f.Nags}
		})
		status, body, err = post("")
	}
	if err != nil {
		if ctx.Err() != nil {
			return nil, newError(CodeCancelled, "sign-in was cancelled", ctx.Err())
		}
		return nil, newError(CodeNetworkError, "could not reach Sponsorkit to complete sign-in", err)
	}
	switch {
	case status == http.StatusOK:
	case status == http.StatusBadRequest && problemCode(body) == "invalid_code":
		return nil, newError(CodeInvalidCode, "the sign-in code was rejected (HTTP 400 invalid_code)", nil)
	case status == http.StatusTooManyRequests:
		e := newError(CodeNetworkError, "Sponsorkit rate limited the sign-in (HTTP 429)", nil)
		if ra, sent := parseRetryAfter(retryAfter, time.Now()); sent {
			e.RetryAfter = &ra
		}
		return nil, e
	default:
		// PROTOCOL §7: any other response (including 400 invalid_request) is
		// an unexpected response: network_error, with Retry-After when sent.
		msg := fmt.Sprintf("unexpected response from Sponsorkit during sign-in (HTTP %d", status)
		if pc := problemCode(body); pc != "" {
			msg += " " + pc
		}
		e := newError(CodeNetworkError, msg+")", nil)
		if ra, sent := parseRetryAfter(retryAfter, time.Now()); sent {
			e.RetryAfter = &ra
		}
		return nil, e
	}
	var tr tokenResponse
	if err := json.Unmarshal(body, &tr); err != nil || tr.SessionToken == "" || tr.Result == nil {
		return nil, newError(CodeNetworkError, "malformed sign-in response from Sponsorkit", err)
	}
	result := tr.Result
	result.FromCache = false
	if result.Contributions == nil {
		result.Contributions = []Contribution{}
	}
	storedAt := isoTime(c.now())
	if err := st.update(func(f *storageFile) *storageFile {
		f.SessionToken = strPtr(tr.SessionToken)
		f.Cache = &cacheEntry{Result: *result.clone(), StoredAt: storedAt}
		return f
	}); err != nil {
		// PROTOCOL §7.0: a sign-in that cannot be persisted is a configuration
		// problem (unwritable StorageDir or failing Storage).
		return nil, newError(CodeInvalidConfig, "could not store the session", err)
	}
	return result, nil
}
