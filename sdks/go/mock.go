package sponsorkit

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
)

// mockPresetsJSON is fixtures/mock-presets.json from the conformance kit,
// embedded byte for byte (PROTOCOL §7.1 item 12).
//
//go:embed mock-presets.json
var mockPresetsJSON []byte

// MockPresetNames lists the mock presets (SPEC §7.4).
var MockPresetNames = []string{"signed-out", "none", "active-monthly", "one-time", "cancelled", "org"}

type mockPresetsFile struct {
	Version   int                       `json:"version"`
	Supporter any                       `json:"supporter"`
	Presets   map[string]mockPresetJSON `json:"presets"`
	Checkout  any                       `json:"checkout"`
}

type mockPresetJSON struct {
	SignedIn      bool  `json:"signedIn"`
	Contributions []any `json:"contributions"`
}

var mockPresets = func() mockPresetsFile {
	var f mockPresetsFile
	if err := json.Unmarshal(mockPresetsJSON, &f); err != nil {
		panic("sponsorkit: embedded mock presets are invalid: " + err.Error())
	}
	return f
}()

// Mock configures mock mode: no network and no disk access, results carry
// mock: true. Create one with MockPreset or MockContributions.
type Mock struct {
	// Preset is one of MockPresetNames. When empty, Contributions is used.
	Preset string
	// Contributions is returned as is (signed in) when Preset is empty.
	Contributions []Contribution
}

// MockPreset returns a mock configuration for a named preset:
// "signed-out", "none", "active-monthly", "one-time", "cancelled" or "org".
func MockPreset(name string) *Mock { return &Mock{Preset: name} }

// MockContributions returns a mock configuration that is signed in and has
// exactly the given contributions.
func MockContributions(contributions ...Contribution) *Mock {
	if contributions == nil {
		contributions = []Contribution{}
	}
	return &Mock{Contributions: contributions}
}

func validMockPreset(name string) bool {
	_, ok := mockPresets.Presets[name]
	return ok
}

// expandTemplate replaces "{provider}" and "{target}" in every string of v and
// decodes the result into out.
func expandTemplate(v any, first target, out any) error {
	var walk func(any) any
	walk = func(x any) any {
		switch t := x.(type) {
		case string:
			return strings.ReplaceAll(strings.ReplaceAll(t, "{provider}", string(first.provider)), "{target}", first.String())
		case []any:
			r := make([]any, len(t))
			for i, e := range t {
				r[i] = walk(e)
			}
			return r
		case map[string]any:
			r := make(map[string]any, len(t))
			for k, e := range t {
				r[k] = walk(e)
			}
			return r
		default:
			return x
		}
	}
	b, err := json.Marshal(walk(v))
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}

type mockState struct {
	signedIn      bool
	contributions []Contribution
}

func initialMockState(ts []target, m *Mock) (*mockState, error) {
	if m.Preset == "" {
		cs := make([]Contribution, len(m.Contributions))
		copy(cs, m.Contributions)
		return &mockState{signedIn: true, contributions: cs}, nil
	}
	p, ok := mockPresets.Presets[m.Preset]
	if !ok {
		return nil, newError(CodeInvalidConfig, fmt.Sprintf("unknown mock preset %q (expected one of %s)", m.Preset, strings.Join(MockPresetNames, ", ")), nil)
	}
	cs := make([]Contribution, 0, len(p.Contributions))
	for _, tpl := range p.Contributions {
		var c Contribution
		if err := expandTemplate(tpl, ts[0], &c); err != nil {
			return nil, newError(CodeInvalidConfig, "invalid mock preset", err)
		}
		cs = append(cs, c)
	}
	return &mockState{signedIn: p.SignedIn, contributions: cs}, nil
}

func mockResult(ts []target, s *mockState) *Result {
	r := &Result{
		SignedIn:      s.signedIn,
		Mock:          true,
		Targets:       targetStrings(ts),
		Contributions: []Contribution{},
	}
	if s.signedIn {
		var sup Supporter
		if err := expandTemplate(mockPresets.Supporter, ts[0], &sup); err == nil {
			r.Supporter = &sup
		}
		r.Contributions = append(r.Contributions, s.contributions...)
	}
	return r.clone()
}

func mockCheckoutContribution(ts []target, opts CheckoutOptions) Contribution {
	first := ts[0]
	for _, t := range ts {
		if t.provider == opts.Provider {
			first = t
		}
	}
	var c Contribution
	_ = expandTemplate(mockPresets.Checkout, first, &c)
	c.Amount = Money{Value: 500, Currency: "USD"}
	if opts.Amount != 0 {
		c.Amount.Value = opts.Amount
	}
	if opts.Currency != "" {
		c.Amount.Currency = opts.Currency
	}
	c.Frequency = Monthly
	if opts.Frequency != "" {
		c.Frequency = opts.Frequency
	}
	if c.Frequency == OneTime {
		c.Kind, c.Status = KindOneTime, StatusPaid
	} else {
		c.Kind, c.Status = KindRecurring, StatusActive
	}
	return c
}

func targetStrings(ts []target) []string {
	out := make([]string, len(ts))
	for i, t := range ts {
		out[i] = t.String()
	}
	return out
}
