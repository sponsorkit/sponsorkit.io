---
title: Testing with Go
description: Mock presets and custom contributions, test hooks for the environment, clock, storage and terminal, a fake API with net/http/httptest, and keeping CI quiet.
sidebar_label: Testing
order: 60
---

You shouldn't need a real sponsorship to develop or test the code around Sponsorkit. Three tools cover almost
every test:

- **Mock mode** returns fixed results with no network and no disk access. Use it for your rules and your UI.
- **Test hooks** on `sponsorkit.Options` (`Env`, `Clock`, `StorageDir` or `Storage`, `Interactive`,
  `APIBaseURL`, `OpenBrowser`, `PromptForCode`) and `sponsorkit.ResetProcessState()` make the real code paths
  deterministic.
- **`SPONSORKIT_DISABLE`** switches the SDK off entirely, for CI and for users who don't want it.

The examples use the standard `testing` package; nothing in the SDK depends on a test framework.

## Mock mode

Set `Options.Mock` to a preset or to your own contributions:

```go title="mock_test.go"
package main

import (
	"context"
	"testing"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func TestMockModes(t *testing.T) {
	ctx := context.Background()
	preset, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", Mock: sponsorkit.MockPreset("active-monthly")})
	if err != nil {
		t.Fatal(err)
	}
	custom, err := sponsorkit.New(sponsorkit.Options{
		GitHub: "octocat",
		Mock: sponsorkit.MockContributions(sponsorkit.Contribution{
			ID:        "con_test_1",
			Provider:  sponsorkit.GitHub,
			Target:    "github:octocat",
			Via:       sponsorkit.ViaDirect,
			Kind:      sponsorkit.KindRecurring,
			Frequency: sponsorkit.Monthly,
			Status:    sponsorkit.StatusActive,
			Amount:    sponsorkit.Money{Value: 2500, Currency: "USD"},
		}),
	})
	if err != nil {
		t.Fatal(err)
	}

	fc, _ := preset.GetFinancialContribution(ctx)
	if !fc.Mock || len(fc.Active()) != 1 || fc.Active()[0].Amount.Value != 500 {
		t.Fatalf("preset: %+v", fc)
	}
	fc, _ = custom.GetFinancialContribution(ctx)
	if got := fc.Active()[0].Amount.Value; got != 2500 {
		t.Fatalf("custom: got %d", got)
	}
}
```

Or select a preset without changing code:

```bash title="Terminal"
SPONSORKIT_MOCK=one-time go run .
```

`Options.Mock` wins over `SPONSORKIT_MOCK`, and `SPONSORKIT_DISABLE` wins over both. An unknown preset name makes
`New` return `invalid_config`; `sponsorkit.MockPresetNames` lists the valid names.

### Presets

Every preset uses your first target (in canonical order) as the provider and target, and a supporter with ID
`sup_mock` and handle `mock-user`.

| Preset | Signed in | Contributions |
|---|---|---|
| `signed-out` | no | none |
| `none` | yes | none |
| `active-monthly` | yes | $5.00 monthly, `active` |
| `one-time` | yes | $25.00 one-time, `paid` |
| `cancelled` | yes | $5.00 monthly, `cancelled` |
| `org` | yes | $10.00 monthly, `active`, paid by an organization (`Via == ViaOrganization`) |

### What mock mode does

- No network and no disk: nothing is read or written, and nag state lives in memory, per `Client`.
- Results have `Mock` set, `FetchedAt` nil, and are never `Stale`.
- `SignIn` resolves immediately and the client is signed in (with no contributions, if it was signed out).
- `OpenCheckout` resolves immediately with `CheckoutContributed` and a simulated contribution from your
  options ($5.00 USD monthly by default), which later results include.
- `SignOut` returns to the signed-out result. `SessionToken()` is always `""`.

## Unit-testing your rule

Keep your rule in a function that takes a `*sponsorkit.Result`, then feed it mock results. A table test covers the
presets in a few lines:

```go title="rule_test.go"
package main

import (
	"context"
	"testing"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

// isSponsor is the rule under test: any active contribution of at least $5.
func isSponsor(fc *sponsorkit.Result) bool {
	for _, c := range fc.Active() {
		if c.Amount.Currency == "USD" && c.Amount.Value >= 500 {
			return true
		}
	}
	return false
}

func TestIsSponsor(t *testing.T) {
	cases := map[string]bool{
		"signed-out":     false,
		"none":           false,
		"active-monthly": true,
		"one-time":       false, // one-time payments are "paid", never "active"
		"cancelled":      false,
		"org":            true,
	}
	for preset, want := range cases {
		t.Run(preset, func(t *testing.T) {
			sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", Mock: sponsorkit.MockPreset(preset)})
			if err != nil {
				t.Fatal(err)
			}
			fc, err := sk.GetFinancialContribution(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if got := isSponsor(fc); got != want {
				t.Errorf("isSponsor = %v, want %v", got, want)
			}
		})
	}
}
```

## Test hooks

| Hook | Use it to |
|---|---|
| `Env: map[string]string{}` | Isolate the test from the machine's `CI`, `SPONSORKIT_*`, `SSH_CONNECTION` and `DISPLAY`. The map replaces the environment for these variables, so an empty map means "none set". |
| `Clock: func() time.Time` | Control the cache TTL and nag timing. |
| `StorageDir: t.TempDir()` or `Storage` | Keep state out of the user's config directory, or seed it. |
| `Interactive: &yes` | Make `Nag.Due` behave as if attached to a terminal. |
| `APIBaseURL`, `HTTPClient` | Point the SDK at a fake API (below). |
| `OpenBrowser`, `PromptForCode` | Drive sign-in and checkout without a real browser or stdin. |
| `sponsorkit.ResetProcessState()` | Forget per-process memos (nag runs counted, the dev-check result, `Retry-After`), as if a new process started. |

`go test` usually runs in CI with `CI=true`, which would make every `Nag.Due` false, so pass `Env` in nag tests.

### Testing a nag

```go title="nag_test.go"
package main

import (
	"context"
	"testing"
	"time"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func TestWeeklyNag(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	yes := true
	run := func() *sponsorkit.Nag {
		sponsorkit.ResetProcessState() // each call is a new "process"
		sk, err := sponsorkit.New(sponsorkit.Options{
			GitHub:      "octocat",
			StorageDir:  dir,
			Clock:       func() time.Time { return now },
			Env:         map[string]string{},
			Interactive: &yes,
		})
		if err != nil {
			t.Fatal(err)
		}
		return sk.Nag(sponsorkit.NagOptions{ID: "main", Every: 100, OrEvery: 7 * 24 * time.Hour})
	}

	run().Shown() // shown once, now
	now = now.Add(24 * time.Hour)
	if run().Due(ctx, nil) {
		t.Fatal("due after one day")
	}
	now = now.Add(7 * 24 * time.Hour)
	if !run().Due(ctx, nil) {
		t.Fatal("not due after eight days")
	}
}
```

A nil predicate skips `GetFinancialContribution`, so this test makes no request. With a predicate, combine it with
mock mode or the fake API below.

## A fake API with httptest

For integration tests of caching and offline behaviour, point `APIBaseURL` at an `httptest.Server` and seed a
session through your own `Storage`. The state document is the [shared storage format](platform-notes.md#where-state-is-stored);
a session token is `sks_` followed by printable ASCII.

```go title="api_test.go"
package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

// memStorage is an in-memory sponsorkit.Storage.
type memStorage struct {
	mu   sync.Mutex
	docs map[string][]byte
}

func (m *memStorage) Read(key string) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.docs[key], nil
}

func (m *memStorage) Write(key string, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.docs[key] = append([]byte(nil), data...)
	return nil
}

const result = `{"signedIn":true,"disabled":false,"mock":false,"targets":["github:octocat"],
"supporter":{"id":"sup_1","identities":[]},"contributions":[{"id":"con_github_1","provider":"github",
"target":"github:octocat","sponsor":{"type":"user","provider":"github","id":"1","handle":"mona"},
"via":"direct","kind":"recurring","frequency":"monthly","status":"active",
"amount":{"value":500,"currency":"USD"},"tier":null,"flags":[],"private":false,"startedAt":null,
"endedAt":null,"lastChargedAt":null,"nextChargeAt":null,"totalContributed":null}],
"fetchedAt":"2026-01-01T00:00:00Z","stale":false,"fromCache":false}`

func TestServesCacheWhenTheAPIFails(t *testing.T) {
	sponsorkit.ResetProcessState()
	var down atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/contributions" || r.Header.Get("Authorization") != "Bearer sks_test" {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		if down.Load() {
			http.Error(w, "down", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(result))
	}))
	defer srv.Close()

	key, err := sponsorkit.TargetsHash(sponsorkit.Targets{GitHub: "octocat"})
	if err != nil {
		t.Fatal(err)
	}
	store := &memStorage{docs: map[string][]byte{key: []byte(`{"v":1,"sessionToken":"sks_test"}`)}}
	sk, err := sponsorkit.New(sponsorkit.Options{
		GitHub:     "octocat",
		APIBaseURL: srv.URL,
		Storage:    store,
		Env:        map[string]string{},
	})
	if err != nil {
		t.Fatal(err)
	}

	ctx := context.Background()
	fc, _ := sk.GetFinancialContribution(ctx)
	if !fc.SignedIn || fc.FromCache || len(fc.Active()) != 1 {
		t.Fatalf("first call: %+v", fc)
	}

	down.Store(true)
	fc, err = sk.GetFinancialContribution(ctx, sponsorkit.WithCacheTTL(0))
	if err != nil {
		t.Fatal(err) // network problems never surface as errors here
	}
	if !fc.FromCache || !fc.Stale || len(fc.Active()) != 1 {
		t.Fatalf("while down: %+v", fc)
	}
}
```

The SDK's own test suite runs the language-neutral conformance scenarios against a fake Sponsorkit API,
`sdks/conformance/server.ts` (run it with `bun sdks/conformance/server.ts --port 0`). It also serves
non-interactive `/connect` and `/checkout` pages, so you can exercise sign-in and checkout end to end; see
`sdks/conformance/README.md` in the repository. To test against a real API you control, see
[self-hosting](../../reference-http/self-hosting.md).

## Keeping CI quiet

Nags are never due when `CI` is set, so most CI systems need nothing. To be sure the SDK makes no requests and
writes no files during a CI run, set `SPONSORKIT_DISABLE=1`:

```bash title="Terminal"
SPONSORKIT_DISABLE=1 go test ./...
```

With it, `GetFinancialContribution` returns a signed-out result with `Disabled` set, and `SignIn` and
`OpenCheckout` return `disabled`. Tests that set `Options.Env` don't see the process environment, so they are
unaffected. The [mock mode guide](../../guides/mock-mode.md) covers the same tools for every language.
