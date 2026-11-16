package sponsorkit

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// Targets names the accounts a maintainer receives sponsorships on. At least
// one must be set. Accounts are trimmed and lowercased.
type Targets struct {
	// GitHub is a GitHub user or organization login with a Sponsors listing.
	GitHub string
	// OpenCollective is an Open Collective collective slug.
	OpenCollective string
}

type target struct {
	provider Provider
	account  string
}

func (t target) String() string { return string(t.provider) + ":" + t.account }

var (
	// RE2 has no lookahead, so the PROTOCOL §1 GitHub pattern
	// ^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$ is checked as a charset/length
	// pattern plus explicit hyphen rules.
	githubChars = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,38}$`)
	ocSlug      = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,254}$`)
)

func validGitHubLogin(a string) bool {
	return githubChars.MatchString(a) && !strings.HasSuffix(a, "-") && !strings.Contains(a, "--")
}

func normalizeTarget(provider Provider, account string) (target, error) {
	a := strings.ToLower(strings.TrimSpace(account))
	var ok bool
	switch provider {
	case GitHub:
		ok = validGitHubLogin(a)
	case OpenCollective:
		ok = ocSlug.MatchString(a)
	default:
		return target{}, newError(CodeInvalidConfig, fmt.Sprintf("unknown provider %q", provider), nil)
	}
	if !ok {
		return target{}, newError(CodeInvalidConfig, fmt.Sprintf("invalid %s account %q", provider, account), nil)
	}
	return target{provider: provider, account: a}, nil
}

// canonicalTargets validates and orders a target set (PROTOCOL §1).
func canonicalTargets(t Targets) ([]target, error) {
	var out []target
	if t.GitHub != "" {
		tt, err := normalizeTarget(GitHub, t.GitHub)
		if err != nil {
			return nil, err
		}
		out = append(out, tt)
	}
	if t.OpenCollective != "" {
		tt, err := normalizeTarget(OpenCollective, t.OpenCollective)
		if err != nil {
			return nil, err
		}
		out = append(out, tt)
	}
	if len(out) == 0 {
		return nil, newError(CodeInvalidConfig, "at least one target (GitHub or OpenCollective) is required", nil)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].String() < out[j].String() })
	return out, nil
}

func targetsParamOf(ts []target) string {
	parts := make([]string, len(ts))
	for i, t := range ts {
		parts[i] = t.String()
	}
	return strings.Join(parts, ",")
}

func hashParam(param string) string {
	sum := sha256.Sum256([]byte(param))
	return hex.EncodeToString(sum[:])
}

// TargetsParam returns the canonical target param, e.g.
// "github:octocat,opencollective:webpack" (PROTOCOL §1). It returns an
// invalid_config *Error for malformed or missing targets.
func TargetsParam(t Targets) (string, error) {
	ts, err := canonicalTargets(t)
	if err != nil {
		return "", err
	}
	return targetsParamOf(ts), nil
}

// TargetsHash returns targets_hash: the lowercase hex SHA-256 of the canonical
// target param. It names the local storage file.
func TargetsHash(t Targets) (string, error) {
	p, err := TargetsParam(t)
	if err != nil {
		return "", err
	}
	return hashParam(p), nil
}

// NewCodeVerifier returns a PKCE code verifier: 32 random bytes encoded as
// base64url without padding (43 characters, PROTOCOL §2).
func NewCodeVerifier() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("sponsorkit: crypto/rand failed: " + err.Error())
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// CodeChallenge returns the S256 PKCE challenge for verifier:
// base64url(sha256(ascii(verifier))) without padding.
func CodeChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
