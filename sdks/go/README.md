# Sponsorkit for Go

Build financial contributions (GitHub Sponsors and Open Collective) directly into your Go program. There is no Sponsorkit account, API key, dashboard or webhook: you name the account(s) you receive sponsorships on, and write your own rule.

- **Module:** `github.com/sponsorkit/sponsorkit.io/sdks/go` (package `sponsorkit`)
- **Version:** 0.1.0 · **License:** MIT · **Homepage:** <https://sponsorkit.github.io/sponsorkit.io> · **Source:** <https://github.com/sponsorkit/sponsorkit.io>
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
		// OpenCheckout signs in first when needed (loopback, or paste-back
		// when headless), so there is no separate SignIn call here.
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
| `StorageDir` | `os.UserConfigDir()/sponsorkit` | Where the state file lives. If there is no per-user config directory (HOME and XDG_CONFIG_HOME unset, or not absolute paths), state is kept in process memory only: nothing is written to the working directory and `New` still succeeds. |
| `Storage` | `&DirStorage{Dir: StorageDir}` | Replace file storage (e.g. with a keychain-backed implementation). |
| `APIBaseURL` | `https://api.sponsorkit.io` | API origin, used for every API call (`/api/v1/…`). Self-hosting, tests. Trailing slashes are trimmed. |
| `SiteBaseURL` | `https://sponsorkit.github.io/sponsorkit.io`, **or `APIBaseURL` when only that is set** | Site base URL (origin plus optional base path), used for every page URL: `<SiteBaseURL>/connect/`, `<SiteBaseURL>/checkout/`, `CheckoutURL` and the loopback redirect after a checkout sign-in. An empty string counts as unset; trailing slashes are trimmed. Setting only `APIBaseURL` keeps single-origin self-hosting working. |
| `HTTPClient` | `&http.Client{}` | HTTP client for API calls. `RequestTimeout` applies whichever client you pass. |
| `RequestTimeout` | 30 s | Bounds every HTTP request, including reading the response. `sponsorkit.NoRequestTimeout` (any negative value) disables it; the zero value means the 30 s default (the protocol's `requestTimeout: 0` is `NoRequestTimeout` in Go). A timeout is a network error: `GetFinancialContribution` serves the stale cache, `SignIn` returns `network_error`. |
| `OpenBrowser` | `OpenSystemBrowser` | Opens a URL (`xdg-open` / `open` / `rundll32`, never a shell). An opener that exits non-zero within 1.5 s counts as a failure, so `SignInAuto` falls back to paste-back; one still running after 1.5 s counts as opened. The loopback callback is accepted while `OpenBrowser` is still running. |
| `PromptForCode` | `PromptStdin` | Reads the paste-back code; receives the URL to open. `PromptStdin` reads one line without read-ahead; a read abandoned by a cancel or timeout is handed to the next prompt. |
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
| `OpenCheckout(ctx, CheckoutOptions) (*CheckoutResult, error)` | Signs in first if needed, opens `<SiteBaseURL>/checkout/`, then polls until a new or changed contribution appears. `CheckoutOptions.Timeout` (default 10 min) covers only polling; the sign-in phase uses `SignInTimeout` and returns `timeout` when it elapses. Cancelling `ctx` in either phase, or the polling timeout, resolves `Status: "unknown"`. |
| `CheckoutURL(CheckoutOptions) (string, error)` | Synchronous link to `<SiteBaseURL>/checkout/?…` without sign-in; no network or disk. Returns `invalid_config` for an unconfigured provider or an invalid frequency, amount or currency. |
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

Every error from `New`, the `Client` methods and `VerifySession` is a `*sponsorkit.Error` with a `Code` (the pluggable helpers `OpenSystemBrowser`, `PromptStdin` and `DirStorage` return ordinary errors):

| Code | When |
|---|---|
| `invalid_config` | Missing/malformed targets, unknown mock preset, invalid options, a target that doesn't exist (dev-time check), or `SignIn`/`SignOut` could not write the session to storage (unwritable `StorageDir`, failing `Storage`). |
| `disabled` | `SignIn` / `OpenCheckout` with `SPONSORKIT_DISABLE` set. |
| `access_denied`, `invalid_state`, `provider_error` | Sign-in errors delivered by the sign-in page. |
| `invalid_code` | The API rejected the sign-in code exchange (`400 invalid_code`). |
| `cancelled` | The sign-in `ctx` was cancelled, or the user abandoned the paste-back prompt (`errors.Is(err, context.Canceled)` still works). |
| `timeout` | The sign-in exceeded `SignInTimeout`. |
| `network_error` | `SignIn` or `VerifySession` could not reach Sponsorkit, timed out (`RequestTimeout`), or got 5xx, 429 or an unexpected response (including a `400` from `/auth/token` other than `invalid_code`). `Error.RetryAfter` is set when the API sent a usable `Retry-After` (non-finite values are ignored; values are capped at 24 h). Forced `SignInLoopback` also returns it when `127.0.0.1` cannot be bound (`SignInAuto` falls back to paste-back instead). |
| `session_invalid`, `targets_mismatch` | Only from `VerifySession`. |

```go
var skErr *sponsorkit.Error
if errors.As(err, &skErr) && skErr.Code == sponsorkit.CodeDisabled { /* … */ }
// or: sponsorkit.ErrorCodeOf(err) == sponsorkit.CodeDisabled
```

**Never breaking your app:** network errors, 5xx and `429` never surface from `GetFinancialContribution` (only `SignIn` and `VerifySession` report them, as `network_error`). You get the cached result (`FromCache: true, Stale: true`) or, with no cache, a signed-in empty result with `Stale: true`. `Retry-After` is honoured for the rest of the process. A rejected session (`session_invalid`) signs the user out and returns the signed-out result.

## Sign-in flows

- **Loopback** (default with a display): listens on `127.0.0.1:<random>`, opens `https://sponsorkit.github.io/sponsorkit.io/connect/?…&delivery=loopback` (the `SiteBaseURL`) in the browser and waits for the callback, up to `SignInTimeout` (5 minutes by default). During `OpenCheckout` the callback then redirects the browser to `<SiteBaseURL>/checkout/?…&step=choose`.
- **Paste-back** (SSH, containers, no display, when `127.0.0.1` can't be bound, or when the browser can't be opened): prints a `<SiteBaseURL>/connect/?…&delivery=paste` URL to stderr; the user opens it on any device and pastes the code back.

A `GET /callback` without a non-empty `code` or `error` gets `400` and the loopback receiver keeps waiting.

**Stdin can't be cancelled.** The default `PromptStdin` cannot interrupt its blocking read of stdin. After a paste-back sign-in is cancelled or times out, the read stays pending, so the next line the user types goes to it (and is handed to the next `PromptStdin` call), not to your program. If your program reads stdin itself, supply your own `PromptForCode`.

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

`VerifySession` calls `GET /api/v1/contributions` with the token and checks that the session's targets equal yours. It uses no local storage or cache. Options: `WithAPIBaseURL` (default `https://api.sponsorkit.io`), `WithHTTPClient`, `WithRequestTimeout` (default 30 s; `sponsorkit.NoRequestTimeout` disables it; a timeout returns `network_error`).

## Local storage

One file per target set, `<targets_hash>.json`, in the storage directory (PROTOCOL §8): `{ "v": 1, "sessionToken", "cache": { "result", "storedAt" }, "nags" }`. The directory is created `0700` and files `0600`. Writes go to a temporary file that is renamed into place. The format is shared by all Sponsorkit SDKs.

Reading never fails: a document that can't be parsed (or has invalid UTF-8 or a `v` other than 1) reads as empty, and each malformed part reads as absent while the rest is kept: a token that isn't `sks_` followed by printable ASCII, a cache with a bad `storedAt`, a wrong type, a `null` list or a non-object contribution, and individual malformed nag entries. Timestamps with a fractional part of any length are accepted. A refresh writes back its cache and any renewed token only if the stored token is still the one it used, and a `401` clears only that token.

## Development

```sh
cd sdks/go
go test ./...    # unit tests + the full conformance suite (needs `bun` on PATH for the fake server)
go vet ./...
gofmt -l .
```

`TestConformance` starts `bun ../conformance/server.ts` (an API listener at `$BASE_URL` that also serves the pages, plus a separate site listener whose base URL `$SITE_BASE_URL` it reads from `GET /__control` → `siteBaseUrl`), then runs every scenario in `sdks/conformance/scenarios.json` as a subtest named after its id, e.g. `go test -run 'TestConformance/checkout-signs-in-first'`. It sets configure's `processEnv` in the real process environment and restores it after each scenario, maps `cancelAfter` to a cancelled `context.Context`, and passes `configure.siteBaseUrl` as `SiteBaseURL` only when given, checks the optional `server` (`"api"` or `"site"`) of expected requests, and matches `expect.error` against `{code, retryAfter}` from `*sponsorkit.Error`. A `checkoutUrl` step with `amount: 0` (or a fractional amount) is logged and treated as passed, because `CheckoutOptions.Amount` is an `int64` in which 0 means unset.

The website's API reference (`/docs/reference/go`) is generated from the doc comments by `scripts/gen-docs.sh`, which runs the standard-library generator in `scripts/gendocs` (a separate module, so it is not part of the published package):

```sh
bash scripts/gen-docs.sh /tmp/go-ref                  # or: bun run --cwd web docs:generate --only go
bun run --cwd web docs:validate go --dir /tmp/go-ref  # from the repository root
```

Releases are tagged `sdks/go/vX.Y.Z`.
