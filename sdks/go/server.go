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
	apiBaseURL string
	httpClient *http.Client
}

// WithAPIBaseURL sets the API origin VerifySession calls (self-hosting, tests).
func WithAPIBaseURL(u string) VerifyOption { return func(v *verifyConfig) { v.apiBaseURL = u } }

// WithHTTPClient sets the HTTP client VerifySession uses.
func WithHTTPClient(hc *http.Client) VerifyOption { return func(v *verifyConfig) { v.httpClient = hc } }

// VerifySession is the backend helper (SPEC §6.4). A frontend forwards its
// session token (Client.SessionToken); the backend calls VerifySession, which
// fetches GET /api/v1/contributions with the token and checks that the
// session's targets equal targets. It uses no local storage or cache.
//
// Errors: invalid_config (malformed targets), session_invalid (rejected or
// malformed token), targets_mismatch (the session belongs to another target
// set) and unavailable (network error, 5xx or rate limited).
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
		hc = &http.Client{Timeout: 30 * time.Second}
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, newError(CodeSessionInvalid, "no session token", nil)
	}
	res := fetchContributions(ctx, hc, base, token)
	switch res.kind {
	case fetchSessionInvalid:
		return nil, newError(CodeSessionInvalid, "the session token is invalid or expired", nil)
	case fetchRateLimited:
		return nil, newError(CodeUnavailable, fmt.Sprintf("Sponsorkit rate limited this session (retry after %s)", res.retryAfter), nil)
	case fetchFailed:
		msg := "Sponsorkit is unavailable"
		if res.status != 0 {
			msg = fmt.Sprintf("%s (HTTP %d)", msg, res.status)
		}
		return nil, newError(CodeUnavailable, msg, res.err)
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
