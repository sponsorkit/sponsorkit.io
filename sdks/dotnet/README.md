# Sponsorkit for .NET

Build financial contributions into your .NET app or CLI. Sponsorkit tells you what the current user has
contributed to your **GitHub Sponsors** and **Open Collective** accounts and sends them to contribute. You
decide what to do with that: show a thank-you, nag every N runs, or unlock a feature.

- **Zero setup.** There is no Sponsorkit account, API key, dashboard or webhook. You name the accounts you receive money on.
- **Facts, not policy.** Contributions come back per provider as raw data. Sponsorkit never sums or converts currencies.
- **Never breaks your app.** Network errors, outages and rate limits never throw from `GetFinancialContributionAsync`.
- **Targets** `netstandard2.0` and `net8.0`. The only dependency is `System.Text.Json`, and only on netstandard2.0.

## Install

```sh
dotnet add package Sponsorkit
```

## Quickstart

```csharp
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "mathiaslorenzen",       // GitHub Sponsors login (user or org)
    OpenCollective = "sponsorkit",    // Open Collective slug (optional)
    AppName = "my-cli",               // shown on the consent page as "says it is"
});

var fc = await sk.GetFinancialContributionAsync();
if (fc.SignedIn && !fc.Active().Any(c => c.Amount.Currency == "USD" && c.Amount.Value >= 500))
{
    Console.WriteLine("Consider sponsoring my-cli!");
}

// Somewhere in your UI or CLI, for example `my-cli sponsor`:
var result = await sk.OpenCheckoutAsync(new CheckoutOptions { Frequency = Frequencies.Monthly, Amount = 500 });
if (result.Status == CheckoutStatus.Contributed) Console.WriteLine("Thank you! ❤");
```

When the user is not signed in, `GetFinancialContributionAsync` returns `SignedIn == false` without any network
call. Call `SignInAsync()` when the user asks for it, for example from a `my-cli login` command.

## API reference

### `SponsorkitClient`

| Member | Description |
|---|---|
| `new SponsorkitClient(SponsorkitOptions)` | Validates the configuration and performs no I/O. It throws `SponsorkitError("invalid_config")` when there are no targets, a target is malformed, `ApiBaseUrl` or `AppName` is invalid, or the mock preset is unknown. |
| `Task<ContributionResult> GetFinancialContributionAsync(CancellationToken)` | Returns the supporter's contributions to your targets. The result comes from the local cache while it is younger than `CacheTtl`. |
| `Task<ContributionResult> GetFinancialContributionAsync(TimeSpan cacheTtl, CancellationToken)` | The same with a per-call cache TTL. `TimeSpan.Zero` always asks the API, unless a `Retry-After` backoff is in force. |
| `Task<ContributionResult> SignInAsync(SignInOptions?, CancellationToken)` | Signs in via loopback (system browser) or paste-back. While already signed in, `new SignInOptions { Provider = "opencollective" }` adds a second identity to the session. If the stored session has died, it starts a fresh session with the new identity. Cancelling the token throws `cancelled`. |
| `bool IsSignedIn()` | Whether a session token is stored. No network access. |
| `Task<CheckoutResult> OpenCheckoutAsync(CheckoutOptions?, CancellationToken)` | Signs in first if needed, opens the checkout page, then polls until a new or changed contribution appears. It resolves `Unknown` when polling times out (`Timeout`, default 10 minutes) or on cancellation in either phase. The sign-in phase is bounded by `SignInTimeout` and throws `timeout` when it runs out. |
| `string CheckoutUrl(CheckoutUrlOptions?)` | Returns an anonymous checkout link. It is synchronous and offline, so it suits nags, `--help` text and READMEs. It throws `invalid_config` for an unconfigured provider or an invalid frequency, amount or currency. |
| `Task SignOutAsync(CancellationToken)` | Deletes the session token and cache locally and keeps nag state. |
| `SponsorkitNag Nag(NagOptions)` | The nag helper (see below). |
| `static void ResetProcessState()` | Forgets per-process memo state: counted nag runs, the dev-time check and `Retry-After` backoff. Intended for tests. |
| `Targets`, `TargetsHash`, `IsDisabled`, `IsMock`, `ApiBaseUrl` | Read-only information about the instance. |

### `SponsorkitOptions`

| Option | Default | Meaning |
|---|---|---|
| `GitHub`, `OpenCollective` | — | Your accounts. At least one is required. They are trimmed and lowercased. |
| `AppName` | `null` | Shown on the consent page as "says it is". 1–64 characters. |
| `CacheTtl` | 1 hour | How long results are served from the local cache. Values below 60 s are raised to 60 s. A per-call TTL may be any value ≥ 0. |
| `Mock` | `null` | Mock mode (see below). |
| `StorageDirectory` | per-user config dir | `$XDG_CONFIG_HOME/sponsorkit`, `~/Library/Application Support/sponsorkit` or `%APPDATA%\sponsorkit`. |
| `Storage` | `null` | A custom `ISponsorkitStorage` backend, for example a keychain. |
| `ApiBaseUrl` | `https://sponsorkit.io` | For self-hosting and tests. |
| `SignInMethod` | `Auto` | `Auto` uses loopback, and falls back to paste-back over SSH, without a display, or when the browser cannot open. `Loopback` and `Paste` force one flow. |
| `OpenBrowser` | system browser | `Func<string, CancellationToken, Task>`. |
| `PromptForCode` | reads stdin | `Func<string url, CancellationToken, Task<string>>`, used by paste-back sign-in. An empty answer throws `cancelled`. |
| `SignInTimeout` | 5 minutes | How long to wait for a loopback or paste-back sign-in before throwing `timeout`. |
| `Interactive` | TTY detection | Overrides the stdout/stderr terminal check used by the nag helper. |
| `Environment` | process env | Replaces the process environment for `SPONSORKIT_DISABLE`, `SPONSORKIT_MOCK`, `SPONSORKIT_NO_NAG`, `SPONSORKIT_DEV_CHECKS` and `CI` for this instance. It is not merged: a variable missing from the dictionary counts as unset. |
| `DevChecks` | `SPONSORKIT_DEV_CHECKS` | Checks once per process that your targets exist (`invalid_config` if not). Without this option the check is on only when `SPONSORKIT_DEV_CHECKS` is set; .NET has no implicit development signal. |
| `CheckoutPollInterval` | 60 s | How often `OpenCheckoutAsync` polls. |
| `Clock` | `DateTimeOffset.UtcNow` | Injectable time for cache-expiry and nag tests. |
| `HttpClient` | shared client | Bring your own `HttpClient`. |

### `ContributionResult`

The result serializes with `System.Text.Json` to the protocol JSON shape. That is handy for forwarding it to a backend.

| Property | Meaning |
|---|---|
| `SignedIn`, `Disabled`, `Mock` | The mode the SDK is in. |
| `Targets` | The canonical targets, for example `github:mathiaslorenzen`. |
| `Supporter` | `Id` (a pairwise `sup_…`, stable per person and target set) and `Identities`. Each identity has `NeedsReconnect`. |
| `Contributions` | Each contribution has `Provider`, `Target`, `Sponsor`, `Via` (`direct`/`organization`), `Kind`, `Frequency`, `Status`, `Amount` (minor units), `Tier`, `Flags`, `IsPrivate`, the dates and `TotalContributed`. |
| `FetchedAt`, `Stale`, `FromCache` | Freshness. `Stale` means some data could not be refreshed. |

The helpers filter `Contributions`. They never aggregate: `Active()`, `Recurring()`, `OneTime()`,
`ByProvider("github")` and `Direct()`, which excludes organization sponsorships.

### Errors

Every exception is a `SponsorkitError` with a stable `Code` (`SponsorkitErrorCodes`):

| Code | When |
|---|---|
| `invalid_config` | Bad configuration, invalid `CheckoutUrl` options, an unknown mock preset, or (dev-time) a target that doesn't exist. |
| `disabled` | `SignInAsync` or `OpenCheckoutAsync` while `SPONSORKIT_DISABLE` is set. |
| `popup_blocked` | Browser only; never thrown by the .NET SDK. |
| `access_denied`, `invalid_state`, `provider_error` | The provider sign-in failed (delivered to the loopback callback). |
| `invalid_code` | The API rejected the code exchange (`400 invalid_code`). |
| `cancelled` | Sign-in was cancelled through its `CancellationToken`, or no paste-back code was entered. |
| `timeout` | Sign-in did not finish within `SignInTimeout` (default 5 minutes). |
| `network_error` | During sign-in or `VerifySessionAsync`, Sponsorkit could not be reached or answered 5xx, 429 or an unexpected response. `RetryAfter` carries the API's `Retry-After` delay when it sent one. |
| `session_invalid`, `targets_mismatch` | Only from `SponsorkitServer.VerifySessionAsync`. |

`GetFinancialContributionAsync` does not throw for network errors, 5xx responses or rate limits:

- With a cache, it returns the cached result with `FromCache = true, Stale = true`.
- Without a cache, it returns a signed-in empty result with `Stale = true`.
- On `session_invalid`, it clears the stored token and returns the signed-out result.

Cancelling `SignInAsync` throws `SponsorkitError("cancelled")`, and cancelling `OpenCheckoutAsync` returns `Unknown`.
Cancelling `GetFinancialContributionAsync` or `VerifySessionAsync` raises `OperationCanceledException` in the usual .NET way.

## Sign-in flows

- **Loopback (desktop):**
  1. The SDK listens on `http://127.0.0.1:<random>/callback`.
  2. It opens the system browser on the Sponsorkit consent page.
  3. It receives the code and exchanges it with its PKCE verifier.
- **Paste-back (SSH, containers, no display):**
  1. The SDK prints a URL to stderr.
  2. The user opens it on any device.
  3. The user pastes the displayed code back into the terminal.

The session token, the cache and the nag counters are stored in `<StorageDirectory>/<targets_hash>.json`:

- The directory is `0700` and the files are `0600`.
- Writes are atomic.
- The file format is shared with the other Sponsorkit SDKs.

## Nag helper

```csharp
var nag = sk.Nag(new NagOptions("my-cli") { Every = 10, OrEvery = TimeSpan.FromDays(7) });
if (await nag.DueAsync(fc => fc.Active().Count == 0))
{
    Console.Error.WriteLine($"❤ Enjoying my-cli? Support it: {sk.CheckoutUrl(new CheckoutUrlOptions { Frequency = Frequencies.Monthly })}");
    nag.Shown();
}
```

- **Counting runs.** Each process counts one run per nag id, on its first `DueAsync` call. The run counts even when your predicate is false.
- **When it is due.** `DueAsync` returns `predicate && (runs >= Every || sinceLastShown >= OrEvery)`. Before the first `Shown()`, the `OrEvery` clause is false.
- **Resetting.** `Shown()` resets both the counter and the timer.
- **When it never fires.** `DueAsync` always returns `false` when `SPONSORKIT_DISABLE`, `SPONSORKIT_NO_NAG` or `CI` is set, or when stdout or stderr is not a terminal (override the terminal check with the `Interactive` option). `DueAsync(predicate, force: true)` bypasses every check except `SPONSORKIT_DISABLE`.
- **Durations.** `OrEvery` takes a `TimeSpan`. Use `NagOptions.ParseDuration("P7D")` for ISO-8601 durations.
- **No implicit sign-in.** The nag helper never signs the user in.

## Mock mode and testing

```csharp
var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", Mock = "active-monthly" });
// Presets: signed-out | none | active-monthly | one-time | cancelled | org
var custom = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "octocat",
    Mock = SponsorkitMock.WithContributions(new[] { new Contribution { Id = "con_x", Provider = "github", Status = "active" } }),
});
```

- Mock mode makes no network or disk access, and results carry `Mock = true`. Nag state lives in memory, per client instance.
- `SignInAsync()` and `SignOutAsync()` resolve immediately.
- `OpenCheckoutAsync()` simulates a new contribution.
- `SPONSORKIT_MOCK=active-monthly` selects a preset from the environment. The `Mock` option wins over it.
- `SPONSORKIT_DISABLE=1` turns the SDK into a no-op and wins over mock mode.

For integration tests, use these options:

- `ApiBaseUrl` points the SDK at a fake server.
- `OpenBrowser` and `PromptForCode` drive sign-in.
- `StorageDirectory` should be a temp directory.
- `Environment` sets the environment variables for one instance.
- `Clock` controls time.
- `SponsorkitClient.ResetProcessState()` simulates a new process.

## Backend verification

Your app sends the supporter's session token (`sks_…`) to your backend. The backend verifies it without any key:

```csharp
using Sponsorkit;

try
{
    var fc = await SponsorkitServer.VerifySessionAsync(token, new VerifySessionOptions { GitHub = "mathiaslorenzen" });
    var isSupporter = fc.Active().Count > 0;
    var userKey = fc.Supporter?.Id; // stable per person for your target set
}
catch (SponsorkitError e) when (e.Code is SponsorkitErrorCodes.SessionInvalid or SponsorkitErrorCodes.TargetsMismatch)
{
    return Results.Unauthorized();
}
```

`VerifySessionAsync` calls the API live, checks that the session is bound to exactly your targets, and uses no local storage.
When Sponsorkit is unreachable or answers 5xx or 429 it throws `network_error`, with `RetryAfter` set for rate limits.

## Development

```sh
dotnet test sdks/dotnet            # unit tests + the full conformance suite (needs `bun` on PATH)
dotnet format sdks/dotnet/Sponsorkit.slnx --verify-no-changes
dotnet pack sdks/dotnet -c Release
```

The conformance tests run every scenario in `sdks/conformance/scenarios.json` against the fake server (`bun sdks/conformance/server.ts`).

## License

MIT
