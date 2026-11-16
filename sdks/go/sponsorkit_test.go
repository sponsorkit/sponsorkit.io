package sponsorkit_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

type vectorsFile struct {
	TargetSets []struct {
		Input       map[string]string `json:"input"`
		Param       string            `json:"param"`
		TargetsHash string            `json:"targetsHash"`
	} `json:"targetSets"`
	InvalidTargets []struct {
		Provider string `json:"provider"`
		Account  string `json:"account"`
	} `json:"invalidTargets"`
	PKCE []struct {
		CodeVerifier  string `json:"codeVerifier"`
		CodeChallenge string `json:"codeChallenge"`
	} `json:"pkce"`
}

func loadVectors(t *testing.T) vectorsFile {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(kitDir, "fixtures", "vectors.json"))
	if err != nil {
		t.Fatal(err)
	}
	var v vectorsFile
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestTargetsHashVectors(t *testing.T) {
	v := loadVectors(t)
	if len(v.TargetSets) == 0 {
		t.Fatal("no target set vectors")
	}
	for _, ts := range v.TargetSets {
		targets := sponsorkit.Targets{GitHub: ts.Input["github"], OpenCollective: ts.Input["opencollective"]}
		param, err := sponsorkit.TargetsParam(targets)
		if err != nil || param != ts.Param {
			t.Errorf("TargetsParam(%v) = %q, %v; want %q", ts.Input, param, err, ts.Param)
		}
		hash, err := sponsorkit.TargetsHash(targets)
		if err != nil || hash != ts.TargetsHash {
			t.Errorf("TargetsHash(%v) = %q, %v; want %q", ts.Input, hash, err, ts.TargetsHash)
		}
	}
}

func TestInvalidTargetVectors(t *testing.T) {
	for _, it := range loadVectors(t).InvalidTargets {
		var err error
		switch it.Provider {
		case "github":
			// An empty login means "no target", which is invalid as well.
			_, err = sponsorkit.New(sponsorkit.Options{GitHub: it.Account})
		case "opencollective":
			_, err = sponsorkit.New(sponsorkit.Options{OpenCollective: it.Account})
		default:
			// Unknown providers cannot be expressed through Targets; nothing to check.
			continue
		}
		if sponsorkit.ErrorCodeOf(err) != sponsorkit.CodeInvalidConfig {
			t.Errorf("%s:%q: got %v, want invalid_config", it.Provider, it.Account, err)
		}
	}
	if _, err := sponsorkit.New(sponsorkit.Options{}); sponsorkit.ErrorCodeOf(err) != sponsorkit.CodeInvalidConfig {
		t.Errorf("no targets: got %v, want invalid_config", err)
	}
}

func TestPKCEVectors(t *testing.T) {
	for _, p := range loadVectors(t).PKCE {
		if got := sponsorkit.CodeChallenge(p.CodeVerifier); got != p.CodeChallenge {
			t.Errorf("CodeChallenge(%q) = %q, want %q", p.CodeVerifier, got, p.CodeChallenge)
		}
	}
	re := regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
	seen := map[string]bool{}
	for i := 0; i < 20; i++ {
		v := sponsorkit.NewCodeVerifier()
		if !re.MatchString(v) || seen[v] {
			t.Fatalf("bad or repeated verifier %q", v)
		}
		seen[v] = true
		if c := sponsorkit.CodeChallenge(v); !re.MatchString(c) {
			t.Fatalf("bad challenge %q", c)
		}
	}
}

// expandPreset independently expands a fixtures/mock-presets.json template.
func expandPreset(t *testing.T, tpl any, provider, target string) any {
	t.Helper()
	b, _ := json.Marshal(tpl)
	s := strings.ReplaceAll(strings.ReplaceAll(string(b), "{provider}", provider), "{target}", target)
	var out any
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func TestMockPresetsMatchFixture(t *testing.T) {
	fixture := loadJSON(t, filepath.Join(kitDir, "fixtures", "mock-presets.json")).(map[string]any)
	presets := fixture["presets"].(map[string]any)
	if len(presets) != len(sponsorkit.MockPresetNames) {
		t.Fatalf("fixture has %d presets, SDK lists %d", len(presets), len(sponsorkit.MockPresetNames))
	}
	for _, tc := range []struct {
		opts             sponsorkit.Options
		provider, target string
		targets          []any
	}{
		{sponsorkit.Options{GitHub: "octocat", OpenCollective: "webpack"}, "github", "github:octocat", []any{"github:octocat", "opencollective:webpack"}},
		{sponsorkit.Options{OpenCollective: "Webpack"}, "opencollective", "opencollective:webpack", []any{"opencollective:webpack"}},
	} {
		for _, name := range sponsorkit.MockPresetNames {
			preset := presets[name].(map[string]any)
			opts := tc.opts
			opts.Mock = sponsorkit.MockPreset(name)
			opts.Env = map[string]string{}
			c, err := sponsorkit.New(opts)
			if err != nil {
				t.Fatalf("%s: %v", name, err)
			}
			r, err := c.GetFinancialContribution(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			signedIn := preset["signedIn"].(bool)
			var supporter any
			if signedIn {
				supporter = expandPreset(t, fixture["supporter"], tc.provider, tc.target)
			}
			want := map[string]any{
				"signedIn": signedIn, "disabled": false, "mock": true, "targets": tc.targets,
				"supporter": supporter, "contributions": expandPreset(t, preset["contributions"], tc.provider, tc.target),
				"fetchedAt": nil, "stale": false, "fromCache": false,
			}
			if got := normalize(r); !jsonEqual(got, want) {
				t.Errorf("%s (%s): got %s\nwant %s", name, tc.provider, toJSON(got), toJSON(want))
			}
			if c.IsSignedIn() != signedIn {
				t.Errorf("%s: IsSignedIn = %v", name, !signedIn)
			}
		}
	}
	if _, err := sponsorkit.New(sponsorkit.Options{GitHub: "x", Mock: sponsorkit.MockPreset("platinum")}); sponsorkit.ErrorCodeOf(err) != sponsorkit.CodeInvalidConfig {
		t.Errorf("unknown preset: got %v", err)
	}
}

func jsonEqual(a, b any) bool {
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return string(x) == string(y)
}

func TestMockCheckoutAndNag(t *testing.T) {
	ctx := context.Background()
	dir := filepath.Join(t.TempDir(), "never-created")
	c, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", OpenCollective: "webpack", Mock: sponsorkit.MockPreset("signed-out"), StorageDir: dir, Env: map[string]string{}})
	if err != nil {
		t.Fatal(err)
	}
	r, err := c.OpenCheckout(ctx, sponsorkit.CheckoutOptions{Frequency: sponsorkit.Yearly})
	if err != nil || r.Status != sponsorkit.CheckoutContributed {
		t.Fatalf("OpenCheckout = %+v, %v", r, err)
	}
	ct := r.Contribution
	if ct.ID != "con_github_mock_checkout" || ct.Amount != (sponsorkit.Money{Value: 500, Currency: "USD"}) || ct.Kind != sponsorkit.KindRecurring || ct.Status != sponsorkit.StatusActive {
		t.Errorf("unexpected mock checkout contribution %+v", ct)
	}
	fc, _ := c.GetFinancialContribution(ctx)
	if !fc.SignedIn || len(fc.Contributions) != 1 {
		t.Errorf("after checkout: %+v", fc)
	}
	sponsorkit.ResetProcessState()
	nag := c.Nag(sponsorkit.NagOptions{ID: "x", Every: 1})
	if !nag.Due(ctx, nil, sponsorkit.Force()) {
		t.Error("mock nag should be due after one run")
	}
	nag.Shown()
	if nag.Due(ctx, nil, sponsorkit.Force()) {
		t.Error("mock nag should not be due right after Shown")
	}
	if _, err := os.Stat(dir); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("mock mode touched the disk: %v", err)
	}
}

func TestDisabled(t *testing.T) {
	ctx := context.Background()
	dir := filepath.Join(t.TempDir(), "never-created")
	for _, v := range []string{"1", "true", "yes"} {
		c, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", StorageDir: dir, Env: map[string]string{"SPONSORKIT_DISABLE": v}, APIBaseURL: "http://127.0.0.1:1"})
		if err != nil {
			t.Fatal(err)
		}
		if !c.Disabled() {
			t.Errorf("SPONSORKIT_DISABLE=%s should disable", v)
		}
		r, _ := c.GetFinancialContribution(ctx)
		if !r.Disabled || r.SignedIn {
			t.Errorf("unexpected result %+v", r)
		}
		if _, err := c.SignIn(ctx); sponsorkit.ErrorCodeOf(err) != sponsorkit.CodeDisabled {
			t.Errorf("SignIn: %v", err)
		}
		// errors.Is with a bare *Error matches on Code.
		if _, err := c.OpenCheckout(ctx, sponsorkit.CheckoutOptions{}); !errors.Is(err, &sponsorkit.Error{Code: sponsorkit.CodeDisabled}) {
			t.Errorf("OpenCheckout: %v", err)
		}
		if c.Nag(sponsorkit.NagOptions{ID: "x"}).Due(ctx, nil, sponsorkit.Force()) {
			t.Error("Nag.Due must be false when disabled, even when forced")
		}
	}
	for _, v := range []string{"", "0", "false", "FALSE"} {
		c, _ := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", Env: map[string]string{"SPONSORKIT_DISABLE": v}})
		if c.Disabled() {
			t.Errorf("SPONSORKIT_DISABLE=%q should not disable", v)
		}
	}
	if _, err := os.Stat(dir); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("disabled mode touched the disk: %v", err)
	}
}

func TestResultHelpers(t *testing.T) {
	fx := loadJSON(t, filepath.Join(kitDir, "fixtures", "contribution-result.json"))
	b, _ := json.Marshal(fx)
	var r sponsorkit.Result
	if err := json.Unmarshal(b, &r); err != nil {
		t.Fatal(err)
	}
	// Round trip: the Go types preserve the protocol shape exactly.
	if got := normalize(&r); !jsonEqual(got, fx) {
		t.Errorf("round trip changed the result:\n got %s\nwant %s", toJSON(got), toJSON(fx))
	}
	count := func(f func(sponsorkit.Contribution) bool) int {
		n := 0
		for _, c := range r.Contributions {
			if f(c) {
				n++
			}
		}
		return n
	}
	checks := []struct {
		name string
		got  []sponsorkit.Contribution
		want int
	}{
		{"Active", r.Active(), count(func(c sponsorkit.Contribution) bool { return c.Status == sponsorkit.StatusActive })},
		{"Recurring", r.Recurring(), count(func(c sponsorkit.Contribution) bool { return c.Kind == sponsorkit.KindRecurring })},
		{"OneTime", r.OneTime(), count(func(c sponsorkit.Contribution) bool { return c.Kind == sponsorkit.KindOneTime })},
		{"ByProvider(github)", r.ByProvider(sponsorkit.GitHub), count(func(c sponsorkit.Contribution) bool { return c.Provider == sponsorkit.GitHub })},
		{"Direct", r.Direct(), count(func(c sponsorkit.Contribution) bool { return c.Via == sponsorkit.ViaDirect })},
	}
	for _, c := range checks {
		if len(c.got) != c.want {
			t.Errorf("%s: %d, want %d", c.name, len(c.got), c.want)
		}
	}
	if len(r.Recurring())+len(r.OneTime()) != len(r.Contributions) {
		t.Error("Recurring + OneTime should partition the contributions")
	}
	var nilResult *sponsorkit.Result
	if got := nilResult.Active(); got == nil || len(got) != 0 {
		t.Error("helpers on a nil result return an empty slice")
	}
}

func TestCheckoutURL(t *testing.T) {
	c, err := sponsorkit.New(sponsorkit.Options{GitHub: " OctoCat ", OpenCollective: "webpack", APIBaseURL: "http://127.0.0.1:9/"})
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(c.CheckoutURL(sponsorkit.CheckoutOptions{Provider: sponsorkit.OpenCollective, Amount: 1500, Currency: "eur", Frequency: sponsorkit.Yearly}))
	if err != nil {
		t.Fatal(err)
	}
	if u.Scheme+"://"+u.Host+u.Path != "http://127.0.0.1:9/checkout" {
		t.Errorf("base: %s", u)
	}
	want := url.Values{"targets": {"github:octocat,opencollective:webpack"}, "provider": {"opencollective"}, "amount": {"1500"}, "currency": {"EUR"}, "frequency": {"yearly"}}
	if u.Query().Encode() != want.Encode() {
		t.Errorf("query %s, want %s", u.Query().Encode(), want.Encode())
	}
	// Invalid options are left out of the URL, and OpenCheckout rejects them.
	c2, _ := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", Mock: sponsorkit.MockPreset("none")})
	if got := c2.CheckoutURL(sponsorkit.CheckoutOptions{Provider: sponsorkit.OpenCollective, Frequency: "weekly"}); strings.Contains(got, "provider") || strings.Contains(got, "weekly") {
		t.Errorf("invalid options leaked into %s", got)
	}
	if _, err := c2.OpenCheckout(context.Background(), sponsorkit.CheckoutOptions{Amount: -5}); sponsorkit.ErrorCodeOf(err) != sponsorkit.CodeInvalidConfig {
		t.Errorf("negative amount: %v", err)
	}
}

func TestParseISODuration(t *testing.T) {
	ok := map[string]time.Duration{
		"P7D":      7 * 24 * time.Hour,
		"PT2S":     2 * time.Second,
		"PT1.5S":   1500 * time.Millisecond,
		"P1W":      7 * 24 * time.Hour,
		"P1DT2H3M": 26*time.Hour + 3*time.Minute,
		"pt12h":    12 * time.Hour,
	}
	for in, want := range ok {
		if got, err := sponsorkit.ParseISODuration(in); err != nil || got != want {
			t.Errorf("ParseISODuration(%q) = %v, %v; want %v", in, got, err, want)
		}
	}
	for _, in := range []string{"", "P", "PT", "7D", "P1M2", "P1Y", "1h"} {
		if _, err := sponsorkit.ParseISODuration(in); sponsorkit.ErrorCodeOf(err) != sponsorkit.CodeInvalidConfig {
			t.Errorf("ParseISODuration(%q) should fail, got %v", in, err)
		}
	}
}

func TestOptionsValidation(t *testing.T) {
	bad := []sponsorkit.Options{
		{GitHub: "octocat", APIBaseURL: "ftp://example.com"},
		{GitHub: "octocat", APIBaseURL: "not a url"},
		{GitHub: "octocat", AppName: strings.Repeat("x", 65)},
		{GitHub: "octocat", SignInMethod: "carrier-pigeon"},
		{GitHub: "octocat", CacheTTL: -time.Second},
		{GitHub: "octocat", Env: map[string]string{"SPONSORKIT_MOCK": "platinum"}},
	}
	for _, o := range bad {
		if _, err := sponsorkit.New(o); sponsorkit.ErrorCodeOf(err) != sponsorkit.CodeInvalidConfig {
			t.Errorf("New(%+v) = %v, want invalid_config", o, err)
		}
	}
	c, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", Env: map[string]string{"SPONSORKIT_MOCK": " one-time "}})
	if err != nil || !c.IsMock() {
		t.Errorf("SPONSORKIT_MOCK preset: %v", err)
	}
	if got := c.Targets(); len(got) != 1 || got[0] != "github:octocat" || c.TargetsParam() != "github:octocat" {
		t.Errorf("Targets() = %v", got)
	}
}

func TestVerifySessionValidation(t *testing.T) {
	ctx := context.Background()
	if _, err := sponsorkit.VerifySession(ctx, "sks_x", sponsorkit.Targets{}); sponsorkit.ErrorCodeOf(err) != sponsorkit.CodeInvalidConfig {
		t.Errorf("no targets: %v", err)
	}
	if _, err := sponsorkit.VerifySession(ctx, "  ", sponsorkit.Targets{GitHub: "octocat"}); sponsorkit.ErrorCodeOf(err) != sponsorkit.CodeSessionInvalid {
		t.Errorf("empty token: %v", err)
	}
	// Port 9 (discard) is not listening: the API is unreachable.
	_, err := sponsorkit.VerifySession(ctx, "sks_x", sponsorkit.Targets{GitHub: "octocat"}, sponsorkit.WithAPIBaseURL("http://127.0.0.1:9"))
	if sponsorkit.ErrorCodeOf(err) != sponsorkit.CodeUnavailable {
		t.Errorf("unreachable: %v", err)
	}
}

func TestErrorType(t *testing.T) {
	err := error(&sponsorkit.Error{Code: sponsorkit.CodeAccessDenied, Message: "cancelled", Err: context.Canceled})
	if !errors.Is(err, context.Canceled) {
		t.Error("Unwrap should expose the cause")
	}
	if !errors.Is(err, &sponsorkit.Error{Code: sponsorkit.CodeAccessDenied}) || errors.Is(err, &sponsorkit.Error{Code: sponsorkit.CodeDisabled}) {
		t.Error("errors.Is should compare codes")
	}
	if sponsorkit.ErrorCodeOf(errors.Join(errors.New("x"), err)) != sponsorkit.CodeAccessDenied {
		t.Error("ErrorCodeOf should see wrapped errors")
	}
	if !strings.Contains(err.Error(), "access_denied") {
		t.Errorf("Error() = %q", err.Error())
	}
}
