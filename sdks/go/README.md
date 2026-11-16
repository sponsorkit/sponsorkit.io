# Sponsorkit for Go

Build financial contributions (GitHub Sponsors and Open Collective) directly into your Go program. There is no Sponsorkit account, API key, dashboard or webhook: you name the account(s) you receive sponsorships on, and write your own rule.

- **Module:** `github.com/sponsorkit/sponsorkit.io/sdks/go` (package `sponsorkit`)
- **Version:** 0.1.0 · **License:** MIT · **Homepage:** <https://sponsorkit.io> · **Source:** <https://github.com/sponsorkit/sponsorkit.io>
- **Requirements:** Go 1.23+, standard library only.

## Install

```sh
go get github.com/sponsorkit/sponsorkit.io/sdks/go@latest
```

## Quickstart

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	ctx := context.Background()
	sk, err := sponsorkit.New(sponsorkit.Options{
		GitHub:         "mathiaslorenzen", // at least one target
		OpenCollective: "sponsorkit",
		AppName:        "my-cli", // shown on the consent page as "says it is"
	})
	if err != nil {
		log.Fatal(err) // *sponsorkit.Error{Code: "invalid_config"}
	}

	if len(os.Args) > 1 && os.Args[1] == "sponsor" {
		if _, err := sk.SignIn(ctx); err != nil { // loopback, or paste-back when headless
			log.Fatal(err)
		}
		r, err := sk.OpenCheckout(ctx, sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly, Amount: 500})
		if err != nil {
			log.Fatal(err)
		}
		fmt.Println("checkout:", r.Status) // "contributed" or "unknown"
		return
	}

	fc, _ := sk.GetFinancialContribution(ctx) // never fails because of the network
	sponsor := false
	for _, c := range fc.Active() {
		if c.Amount.Currency == "USD" && c.Amount.Value >= 500 {
			sponsor = true
		}
	}
	if !sponsor {
		link, _ := sk.CheckoutURL(sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly})
		fmt.Fprintln(os.Stderr, "Support my-cli:", link)
	}
}
```

Sponsorkit only reports facts. Contributions are returned per provider as raw data; nothing is summed or converted across currencies. Whether an organization sponsorship "counts" (`Via == "organization"`) is up to you.

## API reference

All methods are safe for concurrent use. Methods that may do I/O take a `context.Context`.

### `sponsorkit.New(Options) (*Client, error)`

| Option | Default | Meaning |
|---|---|---|
| `GitHub`, `OpenCollective` | – | The targets. At least one is required. Accounts are trimmed and lowercased. |
| `AppName` | – | Shown on the consent page as "says it is" (max 64 characters). |
| `CacheTTL` | 1 h | How long results are served from the local cache. Values below 1 minute are raised to 1 minute (per-call `WithCacheTTL` is not clamped). |
| `Mock` | – | `sponsorkit.MockPreset(name)` or `sponsorkit.MockContributions(...)`. See [Mock mode](#mock-mode-and-testing). |
| `StorageDir` | `os.UserConfigDir()/sponsorkit` | Where the state file lives. |
| `Storage` | `&DirStorage{Dir: StorageDir}` | Replace file storage (e.g. with a keychain-backed implementation). |
| `APIBaseURL` | `https://sponsorkit.io` | API origin (self-hosting, tests). |
| `HTTPClient` | 30 s timeout | HTTP client for API calls. |
| `OpenBrowser` | `OpenSystemBrowser` | Opens a URL (`xdg-open` / `open` / `rundll32`, never a shell). |
| `PromptForCode` | `PromptStdin` | Reads the paste-back code; receives the URL to open. |
| `SignInMethod` | `SignInAuto` | `SignInAuto`, `SignInLoopback` or `SignInPaste`. |
| `SignInTimeout` | 5 min | How long a loopback or paste-back sign-in may wait for the user. Exceeding it returns `timeout`. |
| `Env` | process env | Override for `SPONSORKIT_DISABLE`, `SPONSORKIT_MOCK`, `SPONSORKIT_NO_NAG`, `SPONSORKIT_DEV_CHECKS`, `CI`, `SSH_CONNECTION`, `DISPLAY`. A non-nil map **replaces** the process environment for these variables (it is not merged). A variable is set when it is non-empty and not `0`/`false`. |
| `DevChecks` | on only when `SPONSORKIT_DEV_CHECKS` is set | Dev-time check that the targets exist (one `GET /api/v1/targets` per process). Go has no implicit development signal. |
| `CheckoutPollInterval` | 60 s | How often `OpenCheckout` polls. |
| `Clock` | `time.Now` | Injectable clock for cache TTL and nag timing. |
| `Stderr` | `os.Stderr` | Where user-facing messages (the paste-back URL) go. |
| `Interactive` | TTY detection | Overrides the stdout/stderr TTY check used by `Nag`. |

### Client methods

| Method | Description |
|---|---|
| `GetFinancialContribution(ctx, ...GetOption) (*Result, error)` | What the user contributed to the targets. `WithCacheTTL(0)` forces a refresh. The only possible error is `invalid_config` from the dev-time check. |
| `SignIn(ctx, ...SignInOptions) (*Result, error)` | Signs in; when already signed in, adds an identity (`SignInOptions{Provider: sponsorkit.OpenCollective}`). Cancel `ctx` to abandon it (`cancelled`); `SignInTimeout` bounds the wait (`timeout`). If the stored session turns out to be dead while adding an identity, it is cleared and the exchange is retried once as a fresh sign-in. |
| `IsSignedIn() bool` | Whether a session token is stored. No network. |
| `SessionToken() string` | The stored `sks_…` token, to forward to your backend. |
| `OpenCheckout(ctx, CheckoutOptions) (*CheckoutResult, error)` | Signs in first if needed, opens `/checkout`, then polls until a new or changed contribution appears. `CheckoutOptions.Timeout` (default 10 min) covers only polling; the sign-in phase uses `SignInTimeout` and returns `timeout` when it elapses. Cancelling `ctx` in either phase, or the polling timeout, resolves `Status: "unknown"`. |
| `CheckoutURL(CheckoutOptions) (string, error)` | Synchronous link to `/checkout` without sign-in; no network or disk. Returns `invalid_config` for an unconfigured provider or an invalid frequency, amount or currency. |
| `SignOut(ctx) error` | Deletes the token and cache locally. Nag state is kept. |
| `Nag(NagOptions) *Nag` | See [Nag helper](#nag-helper). |
| `Targets() []string`, `TargetsParam() string`, `Disabled() bool`, `IsMock() bool` | Introspection. |

`CheckoutOptions`: `Provider`, `Amount` (minor units; 0 means unset, negative is invalid), `Currency` (ISO 4217), `Frequency` (`OneTime`, `Monthly`, `Yearly`), `Timeout`, `PollInterval`, `SignInMethod`.

### `Result`

`Result` mirrors the protocol JSON (`json.Marshal` produces it exactly): `SignedIn`, `Disabled`, `Mock`, `Targets`, `Supporter`, `Contributions`, `FetchedAt`, `Stale`, `FromCache`, `Unavailable`. Helpers filter without aggregating:

```go
fc.Active()                       // status == "active"
fc.Recurring()                    // kind == "recurring"
fc.OneTime()                      // kind == "one_time"
fc.ByProvider(sponsorkit.GitHub)
fc.Direct()                       // excludes organization sponsorships
```

### Errors

Every error is a `*sponsorkit.Error` with a `Code`:

| Code | When |
|---|---|
| `invalid_config` | Missing/malformed targets, unknown mock preset, invalid options, or a target that doesn't exist (dev-time check). |
| `disabled` | `SignIn` / `OpenCheckout` with `SPONSORKIT_DISABLE` set. |
| `access_denied`, `invalid_state`, `provider_error` | Sign-in errors delivered by the sign-in page. |
| `invalid_code` | The API rejected the sign-in code exchange (`400 invalid_code`). |
| `cancelled` | The sign-in `ctx` was cancelled, or the user abandoned the paste-back prompt (`errors.Is(err, context.Canceled)` still works). |
| `timeout` | The sign-in exceeded `SignInTimeout`. |
| `network_error` | `SignIn` or `VerifySession` could not reach Sponsorkit, or got 5xx, 429 or an unexpected response. `Error.RetryAfter` is set when the API sent `Retry-After`. |
| `session_invalid`, `targets_mismatch` | Only from `VerifySession`. |

```go
var skErr *sponsorkit.Error
if errors.As(err, &skErr) && skErr.Code == sponsorkit.CodeDisabled { /* … */ }
// or: sponsorkit.ErrorCodeOf(err) == sponsorkit.CodeDisabled
```

**Never breaking your app:** network errors, 5xx and `429` never surface from `GetFinancialContribution` (only `SignIn` and `VerifySession` report them, as `network_error`). You get the cached result (`FromCache: true, Stale: true`) or, with no cache, a signed-in empty result with `Stale: true`. `Retry-After` is honoured for the rest of the process. A rejected session (`session_invalid`) signs the user out and returns the signed-out result.

## Sign-in flows

- **Loopback** (default with a display): listens on `127.0.0.1:<random>`, opens `https://sponsorkit.io/connect?…&delivery=loopback` in the browser and waits for the callback, up to `SignInTimeout` (5 minutes by default).
- **Paste-back** (SSH, containers, no display, or when the browser can't be opened): prints a `…&delivery=paste` URL to stderr; the user opens it on any device and pastes the code back.

Force one with `Options.SignInMethod` or `SignInOptions.Method`.

## Mock mode and testing

```go
sk, _ := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", Mock: sponsorkit.MockPreset("active-monthly")})
// presets: signed-out, none, active-monthly, one-time, cancelled, org

sk, _ = sponsorkit.New(sponsorkit.Options{GitHub: "octocat", Mock: sponsorkit.MockContributions(myContribution)})
```

Or set `SPONSORKIT_MOCK=active-monthly` (the `Mock` option wins over the variable). Mock mode makes no network or disk access and results carry `Mock: true`. Nag state lives in memory, per `Client`. `SignIn` resolves immediately, `OpenCheckout` simulates a new contribution, and `SignOut` returns to the signed-out shape.

`SPONSORKIT_DISABLE=1` beats mock mode: no network, no disk, `Disabled: true`, `Nag.Due` is always false, and `SignIn`/`OpenCheckout` return `disabled`.

For integration tests, point `APIBaseURL` at a fake server, use a temporary `StorageDir`, replace `OpenBrowser`/`PromptForCode`, pass `Env` (and `Interactive` for nags), and call `sponsorkit.ResetProcessState()` to simulate a new process.

## Nag helper

```go
nag := sk.Nag(sponsorkit.NagOptions{ID: "my-cli", Every: 10, OrEvery: 7 * 24 * time.Hour})
if nag.Due(ctx, func(fc *sponsorkit.Result) bool { return len(fc.Active()) == 0 }) {
	link, _ := sk.CheckoutURL(sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly})
	fmt.Fprintln(os.Stderr, "❤️ Enjoying my-cli? Support it:", link)
	nag.Shown()
}
```

- Each process counts one run per `ID`, on the first `Due` call, even when the predicate is false.
- `Due` is `predicate && (runs >= Every || time since last Shown >= OrEvery)`. Before the first `Shown`, the `OrEvery` clause is false.
- `Due` is always false when `SPONSORKIT_DISABLE`, `SPONSORKIT_NO_NAG` or `CI` is set, or when stdout/stderr is not a terminal (override the TTY check with `Options.Interactive`). `sponsorkit.Force()` bypasses everything except `SPONSORKIT_DISABLE`.
- `sponsorkit.ParseISODuration("P7D")` converts ISO-8601 durations.
- The nag never signs anyone in.

## Backend verification

A backend never needs a key. The client forwards its session token, and the backend verifies it against its own targets:

```go
// client
token := sk.SessionToken()

// server
fc, err := sponsorkit.VerifySession(r.Context(), token, sponsorkit.Targets{GitHub: "mathiaslorenzen"})
switch sponsorkit.ErrorCodeOf(err) {
case "":
	// fc.Active() etc.
case sponsorkit.CodeSessionInvalid, sponsorkit.CodeTargetsMismatch:
	// ask the user to sign in again
case sponsorkit.CodeNetworkError:
	// Sponsorkit unreachable, 5xx or rate limited: retry later
	// (err.(*sponsorkit.Error).RetryAfter is set when the API sent Retry-After)
}
```

`VerifySession` calls `GET /api/v1/contributions` with the token and checks that the session's targets equal yours. It uses no local storage or cache. Options: `WithAPIBaseURL`, `WithHTTPClient`.

## Local storage

One file per target set, `<targets_hash>.json`, in the storage directory (PROTOCOL §8): `{ "v": 1, "sessionToken", "cache": { "result", "storedAt" }, "nags" }`. The directory is created `0700` and files `0600`. Writes go to a temporary file that is renamed into place. The format is shared by all Sponsorkit SDKs.

## Development

```sh
cd sdks/go
go test ./...    # unit tests + the full conformance suite (needs `bun` on PATH for the fake server)
go vet ./...
gofmt -l .
```

`TestConformance` starts `bun ../conformance/server.ts`, then runs every scenario in `sdks/conformance/scenarios.json` as a subtest named after its id, e.g. `go test -run 'TestConformance/checkout-signs-in-first'`. It sets configure's `processEnv` in the real process environment and restores it after each scenario, maps `cancelAfter` to a cancelled `context.Context`, and matches `expect.error` against `{code, retryAfter}` from `*sponsorkit.Error`. A `checkoutUrl` step with `amount: 0` (or a fractional amount) is logged and treated as passed, because `CheckoutOptions.Amount` is an `int64` in which 0 means unset.

Releases are tagged `sdks/go/vX.Y.Z`.
