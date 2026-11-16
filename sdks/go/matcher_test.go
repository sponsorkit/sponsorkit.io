package sponsorkit_test

// Self-tests of the conformance runner's matcher (port of the kit's
// test/matcher.test.ts), so a broken matcher cannot pass scenarios vacuously.

import (
	"encoding/json"
	"reflect"
	"testing"
)

func j(t *testing.T, s string) any {
	t.Helper()
	var v any
	if err := json.Unmarshal([]byte(s), &v); err != nil {
		t.Fatalf("bad JSON %s: %v", s, err)
	}
	return v
}

func TestMatcher(t *testing.T) {
	cases := []struct {
		actual, expected string
		problems         int
	}{
		{`{"a":1,"b":{"c":2,"d":3}}`, `{"b":{"c":2}}`, 0},
		{`{"a":[1,2]}`, `{"a":[1]}`, 1},
		{`{"a":[{"x":1,"y":2}]}`, `{"a":[{"x":1}]}`, 0},
		{`"x"`, `"y"`, 1},
		{`null`, `null`, 0},
		{`{"a":1,"b":2}`, `{"$exact":{"a":1,"b":2}}`, 0},
		{`{"a":1,"b":2}`, `{"$exact":{"a":1}}`, 1},
		{`"sks_abc"`, `{"$regex":"^sks_"}`, 0},
		{`5`, `{"$regex":"5"}`, 1},
		{`{}`, `{"k":{"$absent":true}}`, 0},
		{`{"k":null}`, `{"k":{"$absent":true}}`, 0},
		{`{"k":0}`, `{"k":{"$absent":true}}`, 1},
		{`{"k":null}`, `{"k":{"$any":true}}`, 0},
		{`{}`, `{"k":{"$any":true}}`, 1},
		{`"2026-11-16T18:00:00.000Z"`, `{"$type":"datetime"}`, 0},
		{`"2026-11-16"`, `{"$type":"datetime"}`, 1},
		{`3`, `{"$type":"integer"}`, 0},
		{`3.5`, `{"$type":"integer"}`, 1},
		{`[1,2]`, `{"$len":2}`, 0},
		{`"b"`, `{"$oneOf":["a","b"]}`, 0},
		{`{"a":1}`, `{"$keys":["a"]}`, 0},
		{`"http://h:1/checkout?b=2&a=1"`, `{"$url":{"base":"http://h:1/checkout","query":{"$exact":{"a":"1","b":"2"}}}}`, 0},
		{`"http://h:1/checkout?a=1&c=3"`, `{"$url":{"base":"http://h:1/checkout","query":{"$exact":{"a":"1"}}}}`, 1},
		{`1`, `{"$bogus":1}`, 1},
		{`{}`, `{"k":null}`, 1},
	}
	for _, c := range cases {
		got := match(j(t, c.actual), j(t, c.expected), "$")
		if len(got) != c.problems {
			t.Errorf("match(%s, %s) = %v, want %d problem(s)", c.actual, c.expected, got, c.problems)
		}
	}
}

func TestSubstitute(t *testing.T) {
	vs := vars{"$STORAGE_DIR": "/tmp/x", "$STORAGE_FILE": "/tmp/x/h.json", "$A": "1"}
	got := substitute(j(t, `{"p":"$STORAGE_FILE","q":["$STORAGE_DIR/y","$UNKNOWN","Bearer $A"]}`), vs)
	want := j(t, `{"p":"/tmp/x/h.json","q":["/tmp/x/y","$UNKNOWN","Bearer 1"]}`)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("substitute = %v, want %v", got, want)
	}
}

func TestMatchRequests(t *testing.T) {
	var log []map[string]any
	for _, s := range []string{
		`{"method":"GET","path":"/api/v1/targets","query":{},"headers":{}}`,
		`{"method":"GET","path":"/api/v1/contributions","query":{},"headers":{"authorization":"Bearer t"}}`,
		`{"method":"GET","path":"/api/v1/contributions","query":{},"headers":{"authorization":"Bearer t"}}`,
	} {
		log = append(log, j(t, s).(map[string]any))
	}
	spec := func(s string) map[string]any { return withRequestDefaults(j(t, s).(map[string]any)) }
	cases := []struct {
		spec     string
		problems int
	}{
		{`{"calls":[{"method":"GET","path":"/api/v1/contributions","count":2,"headers":{"authorization":"Bearer t"}}]}`, 0},
		{`{"calls":[{"method":"GET","path":"/api/v1/contributions","count":1}]}`, 1},
		{`{"calls":[]}`, 2},
		{`{"exact":false,"calls":[]}`, 0},
		{`{"includeTargetsLookups":true,"calls":[{"method":"GET","path":"/api/v1/contributions","min":1}]}`, 1},
		{`{"calls":[{"method":"GET","path":"/api/v1/contributions","max":1}]}`, 1},
	}
	for _, c := range cases {
		if got := matchRequests(log, spec(c.spec)); len(got) != c.problems {
			t.Errorf("matchRequests(%s) = %v, want %d problem(s)", c.spec, got, c.problems)
		}
	}
}

func TestStorageSchemaValidator(t *testing.T) {
	schema := loadJSON(t, kitDir+"/schemas/storage-file.schema.json")
	fixture := loadJSON(t, kitDir+"/fixtures/storage-file.json")
	if errs := validateSchema(schema, fixture, "$"); len(errs) > 0 {
		t.Fatalf("fixture rejected: %v", errs)
	}
	for _, bad := range []string{
		`{}`,
		`{"v":2}`,
		`{"v":1,"extra":true}`,
		`{"v":1,"sessionToken":"nope"}`,
		`{"v":1,"nags":{"x":{"runs":-1,"lastShown":null}}}`,
		`{"v":1,"nags":{"x":{"runs":1,"lastShown":"yesterday"}}}`,
		`{"v":1,"cache":{"result":{},"storedAt":"2026-01-01T00:00:00Z"}}`,
	} {
		if errs := validateSchema(schema, j(t, bad), "$"); len(errs) == 0 {
			t.Errorf("schema accepted %s", bad)
		}
	}
}
