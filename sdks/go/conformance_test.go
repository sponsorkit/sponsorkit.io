package sponsorkit_test

// Conformance suite: runs every scenario of sdks/conformance/scenarios.json
// against this SDK and the kit's fake server (sdks/conformance/README.md §3).
// It is a Go port of the kit's reference runner (src/runner.ts) and matcher
// (src/matcher.ts).

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

var kitDir = filepath.Join("..", "conformance")

// ---------------------------------------------------------------- fake server

type fakeServer struct {
	baseURL string
	cmd     *exec.Cmd
	stdin   io.WriteCloser
}

func startFakeServer(t *testing.T) *fakeServer {
	t.Helper()
	bun, err := exec.LookPath("bun")
	if err != nil {
		if home, herr := os.UserHomeDir(); herr == nil {
			if p := filepath.Join(home, ".bun", "bin", "bun"); fileExists(p) {
				bun, err = p, nil
			}
		}
	}
	if err != nil {
		t.Skip("bun is not installed; the conformance fake server needs it")
	}
	cmd := exec.Command(bun, filepath.Join(kitDir, "server.ts"), "--port", "0")
	cmd.Env = append(os.Environ(), "SPONSORKIT_CONFORMANCE_EXIT_ON_STDIN_EOF=1")
	cmd.Stderr = os.Stderr
	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatalf("starting the fake server: %v", err)
	}
	lines := make(chan string, 1)
	go func() {
		line, _ := bufio.NewReader(stdout).ReadString('\n')
		lines <- line
		_, _ = io.Copy(io.Discard, stdout)
	}()
	var line string
	select {
	case line = <-lines:
	case <-time.After(30 * time.Second):
		_ = cmd.Process.Kill()
		t.Fatal("the fake server did not print LISTENING within 30 s")
	}
	m := regexp.MustCompile(`^LISTENING (\d+)\n$`).FindStringSubmatch(line)
	if m == nil {
		_ = cmd.Process.Kill()
		t.Fatalf("unexpected first line from the fake server: %q", line)
	}
	return &fakeServer{baseURL: "http://127.0.0.1:" + m[1], cmd: cmd, stdin: stdin}
}

func (s *fakeServer) stop() {
	_ = s.stdin.Close()
	_ = s.cmd.Process.Kill()
	_ = s.cmd.Wait()
}

// ---------------------------------------------------------------- control API

type control struct {
	baseURL string
	hc      *http.Client
}

func (c *control) call(method, path string, body any) (any, error) {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.baseURL+path, rdr)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var data any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &data); err != nil {
			return nil, fmt.Errorf("%s %s: invalid JSON: %s", method, path, raw)
		}
	}
	if res.StatusCode >= 300 {
		return nil, fmt.Errorf("%s %s -> %d: %s", method, path, res.StatusCode, raw)
	}
	return data, nil
}

type controlState struct {
	LastSessionToken    *string  `json:"lastSessionToken"`
	IssuedSessionTokens []string `json:"issuedSessionTokens"`
	LastRequestSeq      float64  `json:"lastRequestSeq"`
}

func (c *control) state() (controlState, error) {
	var s controlState
	v, err := c.call("GET", "/__control", nil)
	if err != nil {
		return s, err
	}
	b, _ := json.Marshal(v)
	err = json.Unmarshal(b, &s)
	return s, err
}

func (c *control) requests(since float64) ([]map[string]any, error) {
	v, err := c.call("GET", fmt.Sprintf("/__control/requests?since=%d", int64(since)), nil)
	if err != nil {
		return nil, err
	}
	var out []map[string]any
	for _, r := range asSlice(asMap(v)["requests"]) {
		out = append(out, asMap(r))
	}
	return out, nil
}

// ---------------------------------------------------------------- JSON helpers

// undefinedT marks a missing object key (JavaScript `undefined`), which the
// matcher distinguishes from null.
type undefinedT struct{}

var undefined = undefinedT{}

func asMap(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func asSlice(v any) []any {
	s, _ := v.([]any)
	return s
}

func getKey(m map[string]any, k string) any {
	if v, ok := m[k]; ok {
		return v
	}
	return undefined
}

func toJSON(v any) string {
	if v == undefined {
		return "undefined"
	}
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	return string(b)
}

// normalize turns a Go return value into generic JSON (as the matcher compares JSON).
func normalize(v any) any {
	if v == nil {
		return nil
	}
	rv := reflect.ValueOf(v)
	if (rv.Kind() == reflect.Pointer || rv.Kind() == reflect.Slice || rv.Kind() == reflect.Map) && rv.IsNil() {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("<unmarshalable %T>", v)
	}
	var out any
	_ = json.Unmarshal(b, &out)
	return out
}

// ---------------------------------------------------------------- variables

type vars map[string]string

// substitute replaces $NAME variables inside every string, longest names first.
func substitute(v any, vs vars) any {
	names := make([]string, 0, len(vs))
	for n := range vs {
		names = append(names, n)
	}
	sort.Slice(names, func(i, j int) bool {
		if len(names[i]) != len(names[j]) {
			return len(names[i]) > len(names[j])
		}
		return names[i] < names[j]
	})
	var walk func(any) any
	walk = func(x any) any {
		switch t := x.(type) {
		case string:
			for _, n := range names {
				t = strings.ReplaceAll(t, n, vs[n])
			}
			return t
		case []any:
			out := make([]any, len(t))
			for i, e := range t {
				out[i] = walk(e)
			}
			return out
		case map[string]any:
			out := make(map[string]any, len(t))
			for k, e := range t {
				out[k] = walk(e)
			}
			return out
		}
		return x
	}
	return walk(v)
}

// ---------------------------------------------------------------- matcher

var isoDatetime = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$`)

func typeOf(v any) string {
	switch t := v.(type) {
	case undefinedT:
		return "undefined"
	case nil:
		return "null"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	case string:
		return "string"
	case bool:
		return "boolean"
	case float64:
		return "number"
	default:
		return fmt.Sprintf("%T", t)
	}
}

func isOperator(m any) bool {
	mm, ok := m.(map[string]any)
	if !ok {
		return false
	}
	for k := range mm {
		if strings.HasPrefix(k, "$") {
			return true
		}
	}
	return false
}

func match(actual, expected any, path string) []string {
	if isOperator(expected) {
		var errs []string
		ops := asMap(expected)
		keys := make([]string, 0, len(ops))
		for k := range ops {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, op := range keys {
			arg := ops[op]
			switch op {
			case "$exact":
				if actual == undefined || !reflect.DeepEqual(actual, arg) {
					errs = append(errs, fmt.Sprintf("%s: expected exactly %s, got %s", path, toJSON(arg), toJSON(actual)))
				}
			case "$regex":
				s, ok := actual.(string)
				re, err := regexp.Compile(fmt.Sprint(arg))
				if err != nil || !ok || !re.MatchString(s) {
					errs = append(errs, fmt.Sprintf("%s: %s does not match /%v/", path, toJSON(actual), arg))
				}
			case "$absent":
				if arg == true && actual != undefined && actual != nil {
					errs = append(errs, fmt.Sprintf("%s: expected absent or null, got %s", path, toJSON(actual)))
				}
			case "$any":
				if arg == true && actual == undefined {
					errs = append(errs, fmt.Sprintf("%s: expected a value", path))
				}
			case "$type":
				var ok bool
				switch arg {
				case "datetime":
					s, isStr := actual.(string)
					ok = isStr && isoDatetime.MatchString(s)
				case "integer":
					f, isNum := actual.(float64)
					ok = isNum && f == math.Trunc(f)
				default:
					ok = typeOf(actual) == arg
				}
				if !ok {
					errs = append(errs, fmt.Sprintf("%s: expected type %v, got %s", path, arg, toJSON(actual)))
				}
			case "$len":
				n := -1
				switch t := actual.(type) {
				case []any:
					n = len(t)
				case string:
					n = len([]rune(t))
				}
				if float64(n) != arg {
					errs = append(errs, fmt.Sprintf("%s: expected length %v, got %d", path, arg, n))
				}
			case "$oneOf":
				found := false
				for _, o := range asSlice(arg) {
					if len(match(actual, o, path)) == 0 {
						found = true
						break
					}
				}
				if !found {
					errs = append(errs, fmt.Sprintf("%s: %s matches none of %s", path, toJSON(actual), toJSON(arg)))
				}
			case "$url":
				spec := asMap(arg)
				s, _ := actual.(string)
				u, err := url.Parse(s)
				if err != nil || u.Scheme == "" || u.Host == "" {
					errs = append(errs, fmt.Sprintf("%s: %s is not a URL", path, toJSON(actual)))
					break
				}
				base := u.Scheme + "://" + u.Host + u.Path
				if u.Path == "" {
					base += "/"
				}
				if base != spec["base"] {
					errs = append(errs, fmt.Sprintf("%s: URL base %s !== %v", path, base, spec["base"]))
				}
				if q, ok := spec["query"]; ok {
					params := map[string]any{}
					for k, vs := range u.Query() {
						params[k] = vs[len(vs)-1]
					}
					errs = append(errs, match(params, q, path+"?")...)
				}
			case "$keys":
				var got []string
				for k := range asMap(actual) {
					got = append(got, k)
				}
				var want []string
				for _, k := range asSlice(arg) {
					want = append(want, fmt.Sprint(k))
				}
				sort.Strings(got)
				sort.Strings(want)
				if strings.Join(got, ",") != strings.Join(want, ",") {
					errs = append(errs, fmt.Sprintf("%s: keys %v !== %v", path, got, want))
				}
			default:
				errs = append(errs, fmt.Sprintf("%s: unknown operator %s", path, op))
			}
		}
		return errs
	}
	switch e := expected.(type) {
	case []any:
		a, ok := actual.([]any)
		if !ok {
			return []string{fmt.Sprintf("%s: expected an array, got %s", path, toJSON(actual))}
		}
		if len(a) != len(e) {
			return []string{fmt.Sprintf("%s: expected %d items, got %d", path, len(e), len(a))}
		}
		var errs []string
		for i := range e {
			errs = append(errs, match(a[i], e[i], fmt.Sprintf("%s[%d]", path, i))...)
		}
		return errs
	case map[string]any:
		a, ok := actual.(map[string]any)
		if !ok {
			return []string{fmt.Sprintf("%s: expected an object, got %s", path, toJSON(actual))}
		}
		keys := make([]string, 0, len(e))
		for k := range e {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		var errs []string
		for _, k := range keys {
			errs = append(errs, match(getKey(a, k), e[k], path+"."+k)...)
		}
		return errs
	}
	if actual == undefined || !reflect.DeepEqual(actual, expected) {
		return []string{fmt.Sprintf("%s: expected %s, got %s", path, toJSON(expected), toJSON(actual))}
	}
	return nil
}

// matchRequests checks a request log against a request expectation (README §3.6).
func matchRequests(log []map[string]any, spec map[string]any) []string {
	exact := true
	if v, ok := spec["exact"].(bool); ok {
		exact = v
	}
	includeTargets, _ := spec["includeTargetsLookups"].(bool)
	var relevant []map[string]any
	for _, r := range log {
		if !includeTargets && r["method"] == "GET" && r["path"] == "/api/v1/targets" {
			continue
		}
		relevant = append(relevant, r)
	}
	var errs []string
	matched := map[int]bool{}
	for _, callAny := range asSlice(spec["calls"]) {
		call := asMap(callAny)
		n := 0
		for i, r := range relevant {
			if r["method"] != call["method"] || r["path"] != call["path"] {
				continue
			}
			ok := true
			for _, part := range []string{"query", "headers", "body"} {
				if want, has := call[part]; has && len(match(getKey(r, part), want, "$")) > 0 {
					ok = false
				}
			}
			if ok {
				matched[i] = true
				n++
			}
		}
		label := fmt.Sprintf("%v %v", call["method"], call["path"])
		count, hasCount := call["count"].(float64)
		minN, hasMin := call["min"].(float64)
		maxN, hasMax := call["max"].(float64)
		if hasCount && float64(n) != count {
			errs = append(errs, fmt.Sprintf("%s: expected %v matching request(s), got %d", label, count, n))
		}
		if hasMin && float64(n) < minN {
			errs = append(errs, fmt.Sprintf("%s: expected at least %v, got %d", label, minN, n))
		}
		if hasMax && float64(n) > maxN {
			errs = append(errs, fmt.Sprintf("%s: expected at most %v, got %d", label, maxN, n))
		}
		if !hasCount && !hasMin && !hasMax && n < 1 {
			errs = append(errs, fmt.Sprintf("%s: expected at least 1, got 0", label))
		}
	}
	if exact {
		for i, r := range relevant {
			if !matched[i] {
				errs = append(errs, fmt.Sprintf("unexpected request %v %v?%s", r["method"], r["path"], toJSON(r["query"])))
			}
		}
	}
	return errs
}

// ---------------------------------------------------------------- JSON Schema (subset)

// validateSchema implements the subset of JSON Schema 2020-12 used by
// schemas/storage-file.schema.json.
func validateSchema(schema, v any, path string) []string {
	s := asMap(schema)
	if s == nil {
		return nil
	}
	var errs []string
	if anyOf, ok := s["anyOf"]; ok {
		okOne := false
		for _, sub := range asSlice(anyOf) {
			if len(validateSchema(sub, v, path)) == 0 {
				okOne = true
				break
			}
		}
		if !okOne {
			errs = append(errs, fmt.Sprintf("%s: %s matches no anyOf branch", path, toJSON(v)))
		}
	}
	if t, ok := s["type"]; ok {
		types := []any{t}
		if ts, isArr := t.([]any); isArr {
			types = ts
		}
		okType := false
		for _, tt := range types {
			switch tt {
			case "integer":
				f, isNum := v.(float64)
				okType = okType || (isNum && f == math.Trunc(f))
			default:
				okType = okType || typeOf(v) == tt
			}
		}
		if !okType {
			return append(errs, fmt.Sprintf("%s: expected type %v, got %s", path, t, toJSON(v)))
		}
	}
	if c, ok := s["const"]; ok && !reflect.DeepEqual(c, v) {
		errs = append(errs, fmt.Sprintf("%s: expected const %s", path, toJSON(c)))
	}
	if enum, ok := s["enum"]; ok {
		found := false
		for _, e := range asSlice(enum) {
			if reflect.DeepEqual(e, v) {
				found = true
			}
		}
		if !found {
			errs = append(errs, fmt.Sprintf("%s: %s not in enum", path, toJSON(v)))
		}
	}
	if str, ok := v.(string); ok {
		if p, has := s["pattern"].(string); has && !regexp.MustCompile(p).MatchString(str) {
			errs = append(errs, fmt.Sprintf("%s: %q does not match %s", path, str, p))
		}
	}
	if f, ok := v.(float64); ok {
		if mn, has := s["minimum"].(float64); has && f < mn {
			errs = append(errs, fmt.Sprintf("%s: %v < minimum %v", path, f, mn))
		}
		if mx, has := s["maximum"].(float64); has && f > mx {
			errs = append(errs, fmt.Sprintf("%s: %v > maximum %v", path, f, mx))
		}
	}
	if arr, ok := v.([]any); ok {
		if items, has := s["items"]; has {
			for i, e := range arr {
				errs = append(errs, validateSchema(items, e, fmt.Sprintf("%s[%d]", path, i))...)
			}
		}
	}
	if obj, ok := v.(map[string]any); ok {
		props := asMap(s["properties"])
		for _, r := range asSlice(s["required"]) {
			if _, has := obj[fmt.Sprint(r)]; !has {
				errs = append(errs, fmt.Sprintf("%s: missing required %v", path, r))
			}
		}
		for k, e := range obj {
			if sub, has := props[k]; has {
				errs = append(errs, validateSchema(sub, e, path+"."+k)...)
				continue
			}
			switch ap := s["additionalProperties"].(type) {
			case bool:
				if !ap {
					errs = append(errs, fmt.Sprintf("%s: unexpected property %q", path, k))
				}
			case map[string]any:
				errs = append(errs, validateSchema(ap, e, path+"."+k)...)
			}
		}
	}
	return errs
}

// ---------------------------------------------------------------- the runner

type harness struct {
	t         *testing.T
	baseURL   string
	ctl       *control
	constants vars
	schema    any
	browser   *http.Client
}

type scenarioRun struct {
	h *harness
	// savedEnv holds the process environment overwritten by configure's
	// processEnv, restored at the end of the scenario.
	savedEnv    map[string]*string
	id          string
	storageDir  string
	unreachable string
	minted      string
	config      map[string]any
	client      *sponsorkit.Client
}

func (h *harness) runtimeVars(r *scenarioRun) vars {
	s, err := h.ctl.state()
	if err != nil {
		h.t.Fatalf("GET /__control: %v", err)
	}
	v := vars{
		"$BASE_URL":             h.baseURL,
		"$STORAGE_DIR":          r.storageDir,
		"$UNREACHABLE_BASE_URL": r.unreachable,
		"$NOW":                  time.Now().UTC().Format("2006-01-02T15:04:05.000Z07:00"),
	}
	if s.LastSessionToken != nil {
		v["$LAST_SESSION_TOKEN"] = *s.LastSessionToken
	}
	for i, tok := range s.IssuedSessionTokens {
		v[fmt.Sprintf("$SESSION_TOKEN_%d", i+1)] = tok
	}
	if r.minted != "" {
		v["$MINTED_SESSION_TOKEN"] = r.minted
	}
	return v
}

func (h *harness) resolve(r *scenarioRun, v any) any {
	v = substitute(substitute(v, h.constants), h.constants)
	return substitute(v, h.runtimeVars(r))
}

// withDefaults applies the defaults of schemas/scenarios.schema.json.
func withDefaults(step map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range step {
		out[k] = v
	}
	args := map[string]any{}
	for k, v := range asMap(step["args"]) {
		args[k] = v
	}
	def := func(k string, v any) {
		if _, ok := args[k]; !ok {
			args[k] = v
		}
	}
	switch step["action"] {
	case "configure":
		def("apiBaseUrl", "$BASE_URL")
		def("storageDir", "$STORAGE_DIR")
		def("env", map[string]any{})
		// devChecks has no default: absent means the SDK default (README §3.3).
	case "verifySession":
		def("apiBaseUrl", "$BASE_URL")
	case "nagDue":
		def("force", false)
	case "writeStorage":
		def("path", "$STORAGE_FILE")
	}
	if _, has := step["args"]; has || step["action"] == "getFinancialContribution" {
		out["args"] = args
	}
	return out
}

func str(m map[string]any, k string) string {
	s, _ := m[k].(string)
	return s
}

func seconds(m map[string]any, k string) (time.Duration, bool) {
	f, ok := m[k].(float64)
	if !ok {
		return 0, false
	}
	return time.Duration(f * float64(time.Second)), true
}

func boolPtr(b bool) *bool { return &b }

func (h *harness) openBrowser(ctx context.Context, u string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	res, err := h.browser.Do(req)
	if err != nil {
		return err
	}
	_, _ = io.Copy(io.Discard, res.Body)
	return res.Body.Close()
}

func (h *harness) promptForCode(ctx context.Context, u string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", err
	}
	res, err := h.browser.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, res.Body)
	code := res.Header.Get("Sponsorkit-Conformance-Code")
	if code == "" {
		return "", fmt.Errorf("no code at %s (status %d)", u, res.StatusCode)
	}
	return code, nil
}

func (h *harness) newClient(args map[string]any) (*sponsorkit.Client, error) {
	env := map[string]string{}
	for k, v := range asMap(args["env"]) {
		env[k] = fmt.Sprint(v)
	}
	opts := sponsorkit.Options{
		GitHub:         str(args, "github"),
		OpenCollective: str(args, "opencollective"),
		AppName:        str(args, "appName"),
		APIBaseURL:     str(args, "apiBaseUrl"),
		StorageDir:     str(args, "storageDir"),
		SignInMethod:   sponsorkit.SignInMethod(str(args, "signInMethod")),
		Env:            env,
		OpenBrowser:    h.openBrowser,
		PromptForCode:  h.promptForCode,
		Stderr:         io.Discard,
	}
	if d, ok := args["devChecks"].(bool); ok {
		opts.DevChecks = boolPtr(d)
	}
	if ttl, ok := seconds(args, "cacheTtl"); ok {
		opts.CacheTTL = ttl
	}
	if d, ok := seconds(args, "signInTimeout"); ok {
		opts.SignInTimeout = d
	}
	switch m := args["mock"].(type) {
	case string:
		opts.Mock = sponsorkit.MockPreset(m)
	case map[string]any:
		var custom struct {
			Contributions []sponsorkit.Contribution `json:"contributions"`
		}
		b, _ := json.Marshal(m)
		if err := json.Unmarshal(b, &custom); err != nil {
			return nil, err
		}
		opts.Mock = sponsorkit.MockContributions(custom.Contributions...)
	}
	if i, ok := args["interactive"].(bool); ok {
		opts.Interactive = boolPtr(i)
	} else if term(os.Stdout) && term(os.Stderr) {
		// The scenarios assume a non-interactive test process (README §4);
		// keep that true when the suite is run from a terminal.
		opts.Interactive = boolPtr(false)
	}
	return sponsorkit.New(opts)
}

func term(f *os.File) bool {
	st, err := f.Stat()
	return err == nil && st.Mode()&os.ModeCharDevice != 0
}

// errUnrepresentable marks a step whose arguments the Go types cannot express
// (README §3.3: the harness treats such a step as passed).
var errUnrepresentable = errors.New("not representable in the Go SDK's types")

// checkoutOptions converts loose checkout args. ok is false when a value
// cannot be expressed: Amount is an int64 of minor units in which 0 means
// unset, so an explicit 0 or a fractional amount cannot be passed.
func checkoutOptions(args map[string]any) (o sponsorkit.CheckoutOptions, ok bool) {
	ok = true
	if a, has := args["amount"].(float64); has && (a == 0 || a != math.Trunc(a)) {
		ok = false
	}
	return checkoutOptionsOf(args), ok
}

func checkoutOptionsOf(args map[string]any) sponsorkit.CheckoutOptions {
	o := sponsorkit.CheckoutOptions{
		Provider:     sponsorkit.Provider(str(args, "provider")),
		Currency:     str(args, "currency"),
		Frequency:    sponsorkit.Frequency(str(args, "frequency")),
		SignInMethod: sponsorkit.SignInMethod(str(args, "method")),
	}
	if a, ok := args["amount"].(float64); ok {
		o.Amount = int64(a)
	}
	o.Timeout, _ = seconds(args, "timeout")
	o.PollInterval, _ = seconds(args, "pollInterval")
	return o
}

var errNoInstance = errors.New("no SDK instance (configure failed or was not called)")

// exec runs one simple step. on is the instance to use (nil = the current one).
func (r *scenarioRun) exec(step map[string]any, on *sponsorkit.Client) (any, error) {
	h := r.h
	args := asMap(step["args"])
	ctx := context.Background()
	if on == nil {
		on = r.client
	}
	need := func() (*sponsorkit.Client, error) {
		if on == nil {
			return nil, errNoInstance
		}
		return on, nil
	}
	switch step["action"] {
	case "configure":
		r.client = nil
		r.config = args
		r.setProcessEnv(asMap(args["processEnv"]))
		c, err := h.newClient(args)
		if err != nil {
			return nil, err
		}
		r.client = c
		return nil, nil
	case "restart":
		if r.config == nil {
			return nil, errors.New("restart before configure")
		}
		r.client = nil
		sponsorkit.ResetProcessState()
		c, err := h.newClient(r.config)
		if err != nil {
			return nil, err
		}
		r.client = c
		return nil, nil
	case "signIn":
		c, err := need()
		if err != nil {
			return nil, err
		}
		sctx, cancel := context.WithCancel(ctx)
		defer cancel()
		if after, ok := seconds(args, "cancelAfter"); ok {
			timer := time.AfterFunc(after, cancel)
			defer timer.Stop()
		}
		_, err = c.SignIn(sctx, sponsorkit.SignInOptions{
			Provider: sponsorkit.Provider(str(args, "provider")),
			Method:   sponsorkit.SignInMethod(str(args, "method")),
		})
		return nil, err
	case "isSignedIn":
		c, err := need()
		if err != nil {
			return nil, err
		}
		return c.IsSignedIn(), nil
	case "getFinancialContribution":
		c, err := need()
		if err != nil {
			return nil, err
		}
		var opts []sponsorkit.GetOption
		if ttl, ok := seconds(args, "cacheTtl"); ok {
			opts = append(opts, sponsorkit.WithCacheTTL(ttl))
		}
		return c.GetFinancialContribution(ctx, opts...)
	case "openCheckout":
		c, err := need()
		if err != nil {
			return nil, err
		}
		cctx, cancel := context.WithCancel(ctx)
		defer cancel()
		if after, ok := seconds(args, "cancelAfter"); ok {
			timer := time.AfterFunc(after, cancel)
			defer timer.Stop()
		}
		return c.OpenCheckout(cctx, checkoutOptionsOf(args))
	case "checkoutUrl":
		c, err := need()
		if err != nil {
			return nil, err
		}
		o, ok := checkoutOptions(args)
		if !ok {
			return nil, errUnrepresentable
		}
		u, err := c.CheckoutURL(o)
		if err != nil {
			return nil, err
		}
		return u, nil
	case "signOut":
		c, err := need()
		if err != nil {
			return nil, err
		}
		return nil, c.SignOut(ctx)
	case "nagDue":
		c, err := need()
		if err != nil {
			return nil, err
		}
		no := sponsorkit.NagOptions{ID: str(args, "id")}
		if e, ok := args["every"].(float64); ok {
			no.Every = int(e)
		}
		if s := str(args, "orEvery"); s != "" {
			if no.OrEvery, err = sponsorkit.ParseISODuration(s); err != nil {
				return nil, err
			}
		}
		var pred func(*sponsorkit.Result) bool
		switch str(args, "predicate") {
		case "always":
			pred = func(*sponsorkit.Result) bool { return true }
		case "never":
			pred = func(*sponsorkit.Result) bool { return false }
		case "noActive":
			pred = func(fc *sponsorkit.Result) bool { return len(fc.Active()) == 0 }
		default:
			return nil, fmt.Errorf("unknown predicate %q", str(args, "predicate"))
		}
		var dueOpts []sponsorkit.DueOption
		if f, _ := args["force"].(bool); f {
			dueOpts = append(dueOpts, sponsorkit.Force())
		}
		return c.Nag(no).Due(ctx, pred, dueOpts...), nil
	case "nagShown":
		c, err := need()
		if err != nil {
			return nil, err
		}
		c.Nag(sponsorkit.NagOptions{ID: str(args, "id")}).Shown()
		return nil, nil
	case "verifySession":
		t := asMap(args["targets"])
		return sponsorkit.VerifySession(ctx, str(args, "token"),
			sponsorkit.Targets{GitHub: str(t, "github"), OpenCollective: str(t, "opencollective")},
			sponsorkit.WithAPIBaseURL(str(args, "apiBaseUrl")))
	case "control":
		_, err := h.ctl.call("PATCH", "/__control", args)
		return nil, err
	case "mintSession":
		v, err := h.ctl.call("POST", "/__control/sessions", args)
		if err != nil {
			return nil, err
		}
		r.minted = str(asMap(v), "sessionToken")
		return v, nil
	case "writeStorage":
		path := str(args, "path")
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			return nil, err
		}
		b, _ := json.Marshal(args["json"])
		if err := os.WriteFile(path, b, 0o600); err != nil {
			return nil, err
		}
		return nil, os.Chmod(path, 0o600)
	case "wait":
		d, _ := seconds(args, "seconds")
		time.Sleep(d)
		return nil, nil
	}
	return nil, fmt.Errorf("unknown action %v", step["action"])
}

// setProcessEnv sets configure's processEnv in the real process environment
// (README §3.3), remembering the previous values.
func (r *scenarioRun) setProcessEnv(vs map[string]any) {
	for k, v := range vs {
		if _, saved := r.savedEnv[k]; !saved {
			if prev, ok := os.LookupEnv(k); ok {
				r.savedEnv[k] = &prev
			} else {
				r.savedEnv[k] = nil
			}
		}
		_ = os.Setenv(k, fmt.Sprint(v))
	}
}

func (r *scenarioRun) restoreProcessEnv() {
	for k, v := range r.savedEnv {
		if v == nil {
			_ = os.Unsetenv(k)
		} else {
			_ = os.Setenv(k, *v)
		}
	}
	r.savedEnv = map[string]*string{}
}

func randomSuffix() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func (h *harness) runScenario(t *testing.T, sc map[string]any, storageRoot string) {
	id := str(sc, "id")
	r := &scenarioRun{h: h, id: id, storageDir: filepath.Join(storageRoot, id+"-"+randomSuffix()), savedEnv: map[string]*string{}}
	defer r.restoreProcessEnv()
	must := func(_ any, err error) {
		if err != nil {
			t.Fatal(err)
		}
	}
	must(h.ctl.call("POST", "/__control/reset", nil))
	must(h.ctl.call("POST", "/__control", map[string]any{"scenario": id}))
	sponsorkit.ResetProcessState()
	un, err := h.ctl.call("GET", "/__control/unreachable", nil)
	must(un, err)
	r.unreachable = str(asMap(un), "baseUrl")
	st, err := h.ctl.state()
	must(nil, err)
	startSeq := st.LastRequestSeq

	for i, raw := range asSlice(sc["steps"]) {
		step := withDefaults(asMap(raw))
		label := fmt.Sprintf("step %d (%v)", i+1, step["action"])
		st, err := h.ctl.state()
		must(nil, err)
		seq := st.LastRequestSeq
		started := time.Now()
		var returned any
		var thrown error
		switch step["action"] {
		case "group":
			for _, sub := range asSlice(step["steps"]) {
				resolved := asMap(h.resolve(r, withDefaults(asMap(sub))))
				if returned, thrown = r.exec(resolved, nil); thrown != nil {
					break
				}
			}
		case "parallel":
			args := asMap(step["args"])
			if r.config == nil {
				thrown = errors.New("parallel before configure")
				break
			}
			inner := asMap(h.resolve(r, withDefaults(asMap(args["step"]))))
			n := int(args["instances"].(float64))
			clients := make([]*sponsorkit.Client, n)
			for k := range clients {
				if clients[k], thrown = h.newClient(r.config); thrown != nil {
					break
				}
			}
			if thrown != nil {
				break
			}
			results := make([]any, n)
			errs := make([]error, n)
			var wg sync.WaitGroup
			for k := range clients {
				wg.Add(1)
				go func(k int) {
					defer wg.Done()
					results[k], errs[k] = r.exec(inner, clients[k])
				}(k)
			}
			wg.Wait()
			thrown = errors.Join(errs...)
			returned = results
		default:
			returned, thrown = r.exec(asMap(h.resolve(r, step)), nil)
		}
		elapsed := time.Since(started).Seconds()
		if errors.Is(thrown, errUnrepresentable) {
			t.Logf("%s / step %d (%v): skipped, %v", id, i+1, step["action"], thrown)
			continue
		}

		var problems []string
		expect := asMap(step["expect"])
		wantThrow := str(expect, "throws")
		if thrown != nil {
			code := string(sponsorkit.ErrorCodeOf(thrown))
			switch {
			case wantThrow == "":
				problems = append(problems, fmt.Sprintf("unexpected error: %v", thrown))
			case code != wantThrow:
				problems = append(problems, fmt.Sprintf("expected error %s, got %v", wantThrow, thrown))
			}
		} else if wantThrow != "" {
			problems = append(problems, fmt.Sprintf("expected error %s, but the step succeeded", wantThrow))
		}
		if expect != nil {
			e := asMap(h.resolve(r, expect))
			value := normalize(returned)
			if want, ok := e["error"]; ok && thrown != nil {
				problems = append(problems, match(normalizedError(thrown), want, "error")...)
			}
			if want, ok := e["returns"]; ok && thrown == nil {
				problems = append(problems, match(value, want, "returns")...)
			}
			if wantIDs, ok := e["contributionIds"]; ok && thrown == nil {
				var got []string
				v := asMap(value)
				if cs, has := v["contributions"]; has && cs != nil {
					for _, c := range asSlice(cs) {
						got = append(got, str(asMap(c), "id"))
					}
				} else if c := asMap(v["contribution"]); c != nil {
					got = append(got, str(c, "id"))
				}
				var want []string
				for _, x := range asSlice(wantIDs) {
					want = append(want, fmt.Sprint(x))
				}
				sort.Strings(got)
				sort.Strings(want)
				if strings.Join(got, ",") != strings.Join(want, ",") {
					problems = append(problems, fmt.Sprintf("contribution ids %v !== %v", got, want))
				}
			}
			if req, ok := e["requests"]; ok {
				log, err := h.ctl.requests(seq)
				must(nil, err)
				problems = append(problems, matchRequests(log, withRequestDefaults(asMap(req)))...)
			}
			if mn, ok := e["minSeconds"].(float64); ok && elapsed < mn {
				problems = append(problems, fmt.Sprintf("took %.2f s, expected >= %v", elapsed, mn))
			}
			if mx, ok := e["maxSeconds"].(float64); ok && elapsed > mx {
				problems = append(problems, fmt.Sprintf("took %.2f s, expected <= %v", elapsed, mx))
			}
		}
		if len(problems) > 0 {
			t.Fatalf("%s / %s:\n  - %s", id, label, strings.Join(problems, "\n  - "))
		}
	}

	final := asMap(sc["expect"])
	if final == nil {
		return
	}
	e := asMap(h.resolve(r, final))
	var problems []string
	if req, ok := e["requests"]; ok {
		log, err := h.ctl.requests(startSeq)
		must(nil, err)
		problems = append(problems, matchRequests(log, withRequestDefaults(asMap(req)))...)
	}
	for _, fAny := range asSlice(e["files"]) {
		f := asMap(fAny)
		if glob, ok := f["glob"].(string); ok {
			n := globCount(glob)
			if float64(n) != f["count"] {
				problems = append(problems, fmt.Sprintf("%s: %d file(s), expected %v", glob, n, f["count"]))
			}
			continue
		}
		path := str(f, "path")
		info, statErr := os.Stat(path)
		exists := statErr == nil
		switch f["exists"] {
		case true:
			if !exists {
				problems = append(problems, path+": does not exist")
			}
		case false:
			if exists {
				problems = append(problems, path+": exists but should not")
			}
		}
		if !exists {
			continue
		}
		if k := str(f, "kind"); k == "directory" && !info.IsDir() {
			problems = append(problems, path+": not a directory")
		} else if k == "file" && !info.Mode().IsRegular() {
			problems = append(problems, path+": not a file")
		}
		if mode := str(f, "mode"); mode != "" && runtime.GOOS != "windows" {
			if got := fmt.Sprintf("0%o", info.Mode().Perm()); got != mode {
				problems = append(problems, fmt.Sprintf("%s: mode %s, expected %s", path, got, mode))
			}
		}
		_, wantJSON := f["json"]
		if wantJSON || f["schema"] != nil {
			b, err := os.ReadFile(path)
			var data any
			if err == nil {
				err = json.Unmarshal(b, &data)
			}
			if err != nil {
				problems = append(problems, fmt.Sprintf("%s: not valid JSON (%v)", path, err))
				continue
			}
			if f["schema"] == "storage-file" {
				problems = append(problems, validateSchema(h.schema, data, filepath.Base(path))...)
			}
			if wantJSON {
				problems = append(problems, match(data, f["json"], filepath.Base(path))...)
			}
		}
	}
	if len(problems) > 0 {
		t.Fatalf("%s / final expectations:\n  - %s", id, strings.Join(problems, "\n  - "))
	}
}

// normalizedError is the thrown error as the kit's `error` expectation sees
// it: {"code": string, "retryAfter": seconds | null}.
func normalizedError(err error) map[string]any {
	out := map[string]any{"code": string(sponsorkit.ErrorCodeOf(err)), "retryAfter": nil}
	var e *sponsorkit.Error
	if errors.As(err, &e) && e.RetryAfter != nil {
		out["retryAfter"] = e.RetryAfter.Seconds()
	}
	return out
}

func withRequestDefaults(spec map[string]any) map[string]any {
	out := map[string]any{"exact": true, "includeTargetsLookups": false, "calls": []any{}}
	for k, v := range spec {
		out[k] = v
	}
	return out
}

func globCount(pattern string) int {
	dir, base := filepath.Split(pattern)
	parts := strings.Split(base, "*")
	for i, p := range parts {
		parts[i] = regexp.QuoteMeta(p)
	}
	re := regexp.MustCompile("^" + strings.Join(parts, ".*") + "$")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	n := 0
	for _, e := range entries {
		if re.MatchString(e.Name()) {
			n++
		}
	}
	return n
}

func loadJSON(t *testing.T, path string) any {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatalf("%s: %v", path, err)
	}
	return v
}

// TestConformance runs every scenario of scenarios.json as a subtest named
// after its id (e.g. go test -run 'TestConformance/sign-in-loopback').
func TestConformance(t *testing.T) {
	file := asMap(loadJSON(t, filepath.Join(kitDir, "scenarios.json")))
	scenarios := asSlice(file["scenarios"])
	if len(scenarios) == 0 {
		t.Fatal("no scenarios in scenarios.json")
	}
	srv := startFakeServer(t)
	defer srv.stop()

	constants := vars{}
	for k, v := range asMap(file["variables"]) {
		if s, ok := v.(string); ok && !strings.HasPrefix(s, "runtime:") {
			constants[k] = s
		}
	}
	h := &harness{
		t:         t,
		baseURL:   srv.baseURL,
		ctl:       &control{baseURL: srv.baseURL, hc: &http.Client{Timeout: 30 * time.Second}},
		constants: constants,
		schema:    loadJSON(t, filepath.Join(kitDir, "schemas", "storage-file.schema.json")),
		browser:   &http.Client{Timeout: 30 * time.Second},
	}
	storageRoot := t.TempDir()
	for _, scAny := range scenarios {
		sc := asMap(scAny)
		t.Run(str(sc, "id"), func(t *testing.T) {
			h.t = t
			h.runScenario(t, sc, storageRoot)
		})
	}
}
