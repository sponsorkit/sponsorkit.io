package sponsorkit

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// VerifyOption customizes VerifySession.
type VerifyOption func(*verifyConfig)

type verifyConfig struct {
	apiBaseURL     string
	httpClient     *http.Client
	requestTimeout time.Duration
}

// WithAPIBaseURL sets the API origin VerifySession calls (self-hosting, tests).
func WithAPIBaseURL(u string) VerifyOption { return func(v *verifyConfig) { v.apiBaseURL = u } }

// WithHTTPClient sets the HTTP client VerifySession uses.
func WithHTTPClient(hc *http.Client) VerifyOption { return func(v *verifyConfig) { v.httpClient = hc } }

// WithRequestTimeout bounds the VerifySession request, including reading the
// response (PROTOCOL §7.0). The default is 30 s; NoRequestTimeout (or any
// negative value) disables it. A timeout returns network_error.
func WithRequestTimeout(d time.Duration) VerifyOption {
	return func(v *verifyConfig) { v.requestTimeout = d }
}

// VerifySession is the backend helper. A frontend forwards its
// session token (Client.SessionToken); the backend calls VerifySession, which
// fetches GET /api/v1/contributions with the token and checks that the
// session's targets equal targets. It uses no local storage or cache.
//
// Errors: invalid_config (malformed targets), session_invalid (rejected or
// malformed token), targets_mismatch (the session belongs to another target
// set) and network_error (Sponsorkit could not be reached, or answered 5xx,
// 429 or an unexpected response; *Error.RetryAfter carries Retry-After).
func VerifySession(ctx context.Context, token string, targets Targets, opts ...VerifyOption) (*Result, error) {
	cfg := verifyConfig{}
	for _, o := range opts {
		o(&cfg)
	}
	expected, err := TargetsParam(targets)
	if err != nil {
		return nil, err
	}
	base, err := normalizeBaseURL(cfg.apiBaseURL)
	if err != nil {
		return nil, err
	}
	hc := cfg.httpClient
	if hc == nil {
		hc = &http.Client{}
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, newError(CodeSessionInvalid, "no session token", nil)
	}
	res := fetchContributions(ctx, hc, requestTimeoutOf(cfg.requestTimeout), base, token)
	switch res.kind {
	case fetchSessionInvalid:
		return nil, newError(CodeSessionInvalid, "the session token is invalid or expired", nil)
	case fetchRateLimited:
		e := newError(CodeNetworkError, "Sponsorkit rate limited this request (HTTP 429)", nil)
		if res.retryAfterSent {
			ra := res.retryAfter
			e.RetryAfter = &ra
			e.Message = fmt.Sprintf("Sponsorkit rate limited this request (HTTP 429, retry after %s)", ra)
		}
		return nil, e
	case fetchFailed:
		msg := "could not reach Sponsorkit"
		if res.status != 0 {
			msg = fmt.Sprintf("unexpected response from Sponsorkit (HTTP %d)", res.status)
		}
		e := newError(CodeNetworkError, msg, res.err)
		if res.retryAfterSent {
			ra := res.retryAfter
			e.RetryAfter = &ra
		}
		return nil, e
	}
	actual, err := canonicalParamFromStrings(res.result.Targets)
	if err != nil {
		return nil, newError(CodeTargetsMismatch, "the session's targets are malformed", err)
	}
	if actual != expected {
		return nil, newError(CodeTargetsMismatch, fmt.Sprintf("the session is for %s, expected %s", actual, expected), nil)
	}
	return res.result, nil
}

// canonicalParamFromStrings canonicalizes target strings such as "github:x".
func canonicalParamFromStrings(ss []string) (string, error) {
	var t Targets
	for _, s := range ss {
		p, a, ok := strings.Cut(s, ":")
		if !ok {
			return "", fmt.Errorf("invalid target %q", s)
		}
		switch Provider(p) {
		case GitHub:
			if t.GitHub != "" {
				return "", fmt.Errorf("duplicate github target")
			}
			t.GitHub = a
		case OpenCollective:
			if t.OpenCollective != "" {
				return "", fmt.Errorf("duplicate opencollective target")
			}
			t.OpenCollective = a
		default:
			return "", fmt.Errorf("unknown provider in %q", s)
		}
	}
	return TargetsParam(t)
}
