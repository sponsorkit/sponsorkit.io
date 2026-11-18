# sponsorkit (Rust)

Build GitHub Sponsors and Open Collective contributions into your Rust app or CLI.
No Sponsorkit account, no API key, no webhook: name the account(s) you receive
contributions on, ask what the current user contributes, and send them to contribute.

- Reports **facts**: every contribution to your accounts, per provider. You write the rule.
- **Never breaks your app**: if Sponsorkit, a provider or the network is down, you get the cached result.
- Sign-in through the system browser (loopback) or a pasted code on headless machines.
- Mock mode for tests, a polite nag helper, and backend verification of session tokens.

Website: <https://sponsorkit.github.io/sponsorkit.io/> · Spec: `docs/SPEC.md` · Wire protocol: `docs/PROTOCOL.md`

## Install

```toml
[dependencies]
sponsorkit = "0.1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

MSRV: Rust 1.85. Runtime dependencies: `reqwest` (rustls, no OpenSSL), `serde`,
`serde_json`, `tokio`, `tokio-util` (for `CancellationToken`), `sha2`, `base64`, `getrandom`.
The SDK needs a Tokio runtime (current-thread or multi-thread).

## Quickstart

```rust,no_run
use sponsorkit::{CheckoutOptions, Frequency, GetOptions, Options, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),          // at least one target
        opencollective: Some("sponsorkit".into()),
        app_name: Some("my-cli".into()),          // shown on the consent page ("says it is")
        ..Default::default()
    })?;

    let fc = sk.get_financial_contribution(GetOptions::default()).await?;
    let supports = fc.active().iter().any(|c| c.amount.currency == "USD" && c.amount.value >= 500);
    if !fc.signed_in {
        println!("Already a sponsor? Run `my-cli sponsor login`.");
    } else if !supports {
        println!("Support my-cli: {}", sk.checkout_url(&CheckoutOptions::default())?);
    }

    // `my-cli sponsor`: sign in if needed, open the checkout, wait for the contribution.
    let outcome = sk
        .open_checkout(CheckoutOptions {
            frequency: Some(Frequency::Monthly),
            amount: Some(500), // minor units: $5.00
            ..Default::default()
        })
        .await?;
    if let Some(c) = outcome.contribution() {
        println!("Thank you! {} {} {}", c.amount.value, c.amount.currency, c.frequency);
    }
    Ok(())
}
```

## API reference

### `Sponsorkit::new(Options) -> Result<Sponsorkit, Error>`

Performs no I/O. Fails with `invalid_config` when there is no target, a target is
malformed (even when disabled), or the mock preset is unknown.

| `Options` field | Default | Meaning |
|---|---|---|
| `github`, `opencollective` | – | The accounts that receive contributions. At least one. Trimmed and lowercased. |
| `app_name` | – | Your app's name on the consent page (max 64 chars). |
| `cache_ttl` | 1 h (min 60 s) | How long a cached result is served without calling the API. |
| `mock` | – | `Mock::Preset(MockPreset::…)` or `Mock::Contributions(vec![…])`. Beats `SPONSORKIT_MOCK`. |
| `storage_dir` | per-user config dir | Linux `$XDG_CONFIG_HOME/sponsorkit` (else `~/.config/sponsorkit`), macOS `~/Library/Application Support/sponsorkit`, Windows `%APPDATA%\sponsorkit`. Relative values of these variables are ignored. When no directory can be determined (e.g. `HOME` unset), the session is kept in memory for the life of the client: construction never fails for this and nothing is written to the working directory. |
| `api_base_url` | `https://api.sponsorkit.io` (`DEFAULT_API_BASE_URL`) | Origin of the API, used for every API call (`/api/v1/…`). Trailing slashes are trimmed; `""` counts as unset. |
| `site_base_url` | `https://sponsorkit.github.io/sponsorkit.io` (`DEFAULT_SITE_BASE_URL`), **or `api_base_url` when that is set and this is not** | Site base URL (origin plus optional base path), used for every page URL: `<site_base_url>/connect/`, `<site_base_url>/checkout/`, `checkout_url` and the loopback redirect after a checkout sign-in. The fallback keeps single-origin self-hosting and tests working with `api_base_url` alone. Trailing slashes are trimmed; `""` counts as unset. |
| `request_timeout` | 30 s (`DEFAULT_REQUEST_TIMEOUT`) | Timeout for every HTTP request, body included; `Duration::ZERO` disables it. A timeout is a network failure: `get_financial_contribution` serves the stale cache, `sign_in` fails with `network_error`. |
| `sign_in_method` | `Auto` | `Auto` (loopback, falls back to paste-back without a display, over SSH, or when the browser cannot open), `Loopback`, `Paste`. |
| `sign_in_timeout` | 300 s | How long a loopback or paste-back sign-in may take (also the sign-in phase of `open_checkout`). Exceeding it fails with `timeout`. |
| `env` | process environment | Override for `SPONSORKIT_DISABLE`, `SPONSORKIT_MOCK`, `SPONSORKIT_NO_NAG`, `SPONSORKIT_DEV_CHECKS`, `CI`. When given, it **replaces** the process environment for these variables (not merged). |
| `dev_checks` | on when `SPONSORKIT_DEV_CHECKS` is set | Dev-time check that the targets exist (one `GET /api/v1/targets` per process, on the first async call). Rust has no implicit development signal; the option beats the variable. |
| `checkout_poll_interval` | 60 s | How often `open_checkout` re-checks. |
| `interactive` | stdout+stderr are terminals | Override terminal detection for the nag helper. |
| `open_browser` | system browser | Hook `Fn(String) -> BoxFuture<io::Result<()>>`. The default launcher (`open`, `xdg-open`, `rundll32`) counts as failed only if it exits non-zero within 1.5 s; one still running is assumed to be opening the browser. The callback is accepted even while the hook is still running. With `Auto`, a failed launch (or a loopback port that cannot be bound on `127.0.0.1`) falls back to paste-back. A `GET /callback` with neither a non-empty `code` nor a non-empty `error` gets `400` and the SDK keeps waiting. |
| `prompt_for_code` | read a line from stdin | Hook `Fn(paste_url: String) -> BoxFuture<io::Result<String>>`. |
| `restart` | `false` | Reset per-process memo state first (same as `Sponsorkit::reset_process_state()`). |

An environment variable counts as **set** when it is non-empty and not `0` or `false` (case-insensitive).

### Methods

| Method | Returns | Notes |
|---|---|---|
| `get_financial_contribution(GetOptions { cache_ttl })` | `Result<ContributionResult>` | Never fails for network/server problems (see below). `GetOptions::fresh()` bypasses the cache. |
| `sign_in(SignInOptions { provider, method, cancel })` | `Result<ContributionResult>` | Loopback or paste-back, bounded by `sign_in_timeout`. While signed in, adds a second identity (`provider: Some(Provider::OpenCollective)`); if the stored session is dead, it is cleared and the same code is exchanged again for a new session. |
| `is_signed_in()` | `bool` | Local only. |
| `open_checkout(CheckoutOptions { provider, amount, currency, frequency, timeout, poll_interval, cancel, sign_in_method })` | `Result<CheckoutOutcome>` | Signs in first if needed, opens `<site_base_url>/checkout/` (after a loopback sign-in the browser is redirected to `<site_base_url>/checkout/?…&step=choose`), polls until a new or changed contribution appears. `Contributed { contribution }` or `Unknown` (polling `timeout`, default 10 min, or cancellation in either phase). The `timeout` starts once the checkout page is open; signing in first is bounded by `sign_in_timeout` and fails with `timeout`. |
| `checkout_url(&CheckoutOptions)` | `Result<String>` | Synchronous, offline link to `<site_base_url>/checkout/?…` without sign-in. For nags and READMEs. `invalid_config` for an unconfigured provider, an amount ≤ 0 or a currency that is not three letters. |
| `sign_out()` | `Result<()>` | Deletes the session token and cache; keeps nag state. |
| `nag(NagOptions)` | `Nag` | See [Nag helper](#nag-helper). |
| `Sponsorkit::reset_process_state()` | – | Forget nag runs counted, the dev-check memo and `Retry-After` back-offs. |

### `ContributionResult`

Same JSON shape in every Sponsorkit SDK (`serde_json::to_value(&fc)` gives camelCase keys):
`signed_in`, `disabled`, `mock`, `targets`, `supporter` (`id`, `identities`),
`contributions`, `fetched_at`, `stale`, `from_cache`, `unavailable`.

Helpers filter, they never sum across providers or currencies:
`fc.active()`, `fc.recurring()`, `fc.one_time()`, `fc.by_provider(Provider::GitHub)`, `fc.direct()`.

Each `Contribution` has `id`, `provider`, `target`, `sponsor`, `via` (`Direct`/`Organization`),
`kind`, `frequency`, `status` (`Active`, `Paused`, `Cancelled`, `Paid`, `Refunded`,
`Disputed`, `Failed`, `Pending`), `amount` (`Money { value /* minor units */, currency }`),
`tier`, `flags`, `private`, `started_at`, `ended_at`, `last_charged_at`, `next_charge_at`,
`total_contributed`.

### Error contract

| Situation | Behaviour |
|---|---|
| No targets / malformed target / target doesn't exist (dev check) / invalid checkout options | `Err` with `ErrorCode::InvalidConfig` |
| Not signed in | Signed-out result, no network call |
| Session invalid | Token and cache cleared, signed-out result |
| One provider unavailable | Its cached contributions are merged in, `stale: true` |
| Network error, request timeout, 5xx, 429 | Cached result (`from_cache: true, stale: true`), or a signed-in empty result with `stale: true`. `Retry-After` (integer seconds, clamped to 24 h; other values are ignored and a 429 then backs off 60 s) is honoured for the rest of the process. **Never an error.** |
| Sign-in or sign-out while a refresh is in flight | The refresh writes back its cache and any renewed token only if the stored token is still the one it used; a `401` clears only that token. |
| Corrupt or malformed storage file | Read as absent (or just the malformed part dropped); reading never fails. |
| `SPONSORKIT_DISABLE=1` | No network or disk. `disabled: true`; nags are never due; `sign_in`/`open_checkout` fail with `Disabled`. |

`Error::code()` returns an `ErrorCode`; `ErrorCode::as_str()` gives the wire spelling shared
by all SDKs (PROTOCOL §7):

| Code | When |
|---|---|
| `invalid_config` | Bad options or targets, dev-time check failed, or a local environment the SDK cannot work in: `sign_in` could not persist the session, or `sign_out` could not clear it (unwritable storage directory) |
| `disabled` | `sign_in`/`open_checkout` while `SPONSORKIT_DISABLE` is set |
| `popup_blocked` | Browser SDK only; listed for parity |
| `access_denied`, `invalid_state`, `provider_error` | Delivered by the sign-in page |
| `invalid_code` | The API rejected the code exchange (`400 invalid_code`) |
| `cancelled` | `SignInOptions::cancel` fired, or nothing was entered at the paste-back prompt |
| `timeout` | Sign-in exceeded `sign_in_timeout` |
| `network_error` | `sign_in` or `verify_session` could not reach the API, hit `request_timeout`, or got 5xx, 429 or an unexpected answer (including a `400` from `/auth/token` with a code other than `invalid_code`). `Error::retry_after()` returns the API's `Retry-After` (clamped to 24 h), if any |
| `session_invalid`, `targets_mismatch` | Only from `verify_session` |

```rust,no_run
# async fn run(sk: sponsorkit::Sponsorkit) {
use sponsorkit::{ErrorCode, SignInOptions};
match sk.sign_in(SignInOptions::default()).await {
    Ok(fc) => println!("signed in, {} contributions", fc.contributions.len()),
    Err(e) if e.code() == ErrorCode::AccessDenied => println!("No problem, maybe later."),
    Err(e) => eprintln!("{e}"),
}
# }
```

### Cancellation

`sign_in` and `open_checkout` take a `tokio_util` `CancellationToken` (re-exported as
`sponsorkit::CancellationToken`) in `SignInOptions::cancel` / `CheckoutOptions::cancel`.
Cancelling `sign_in` fails with `cancelled`; cancelling `open_checkout` (while it signs in
or while it polls) resolves `CheckoutOutcome::Unknown` instead of failing. Dropping the future (for example through
`tokio::time::timeout` or `tokio::select!`) also stops everything, including the loopback
listener, but yields no result. The default paste-back prompt reads stdin on one
long-lived background thread, because a blocking read cannot be interrupted: an abandoned
prompt does not keep the runtime from shutting down, and the line typed after it goes to
the next prompt. **Limitation:** that pending read cannot be cancelled, so after a cancelled
or timed-out paste-back the next line typed on stdin is consumed by the SDK's reader (and
handed to the next paste-back prompt), not by your app. Apps that read stdin themselves
should supply `prompt_for_code`.

The example below uses `tokio::signal`, which needs tokio's `signal` feature on top of the
features listed under [Install](#install).

```rust,no_run
# async fn run(sk: sponsorkit::Sponsorkit) -> Result<(), sponsorkit::Error> {
use sponsorkit::{CancellationToken, CheckoutOptions};
let cancel = CancellationToken::new();
let c2 = cancel.clone();
tokio::spawn(async move { tokio::signal::ctrl_c().await.ok(); c2.cancel(); });
let outcome = sk.open_checkout(CheckoutOptions { cancel: Some(cancel), ..Default::default() }).await?;
# Ok(()) }
```

## Nag helper

```rust,no_run
# async fn run(sk: sponsorkit::Sponsorkit) {
use sponsorkit::{CheckoutOptions, Frequency, NagOptions, parse_iso_duration};

let nag = sk.nag(NagOptions::new("my-cli", 10).or_every(parse_iso_duration("P7D").unwrap()));
if nag.due(|fc| fc.active().is_empty()).await {
    let url = sk.checkout_url(&CheckoutOptions { frequency: Some(Frequency::Monthly), ..Default::default() }).unwrap();
    eprintln!("Enjoying my-cli? Support it: {url}");
    nag.shown().await;
}
# }
```

- The run counter goes up once per process per `id`, on the first `due()` call (even when the predicate is false).
- `due()` is `predicate && (runs >= every || since(last_shown) >= or_every)`; `shown()` resets both.
- `due()` is always false when `SPONSORKIT_DISABLE`, `SPONSORKIT_NO_NAG` or `CI` is set, or stdout/stderr
  is not a terminal (override with `Options::interactive`), unless `due_with(pred, DueOptions { force: true })` (force never overrides `SPONSORKIT_DISABLE`).
- It never signs in implicitly.

## Mock mode and testing

```rust
use sponsorkit::{GetOptions, MockPreset, Options, Sponsorkit};

# #[tokio::main(flavor = "current_thread")] async fn main() {
let sk = Sponsorkit::new(Options {
    github: Some("octocat".into()),
    mock: Some(MockPreset::ActiveMonthly.into()), // signed-out | none | active-monthly | one-time | cancelled | org
    ..Default::default()
}).unwrap();
let fc = sk.get_financial_contribution(GetOptions::default()).await.unwrap();
assert!(fc.mock && fc.active().len() == 1);
# }
```

- `Mock::Contributions(vec![…])` gives a signed-in result with exactly those contributions.
- `SPONSORKIT_MOCK=active-monthly` selects a preset from the environment (the `mock` option wins).
- Mock mode performs no network and no disk access. `sign_in` resolves immediately and
  `open_checkout` simulates a new contribution; state, including nag runs, lives in memory per instance.
- `SPONSORKIT_DISABLE=1` beats mock mode.
- For end-to-end tests, inject `open_browser`, `prompt_for_code`, `storage_dir`,
  `api_base_url`, `site_base_url`, `env` and `checkout_poll_interval` (see `tests/common/mod.rs`).

## Backend verification

A backend that needs a trustworthy answer receives the session token from the client
and asks Sponsorkit directly. No key is needed; the token is sealed by Sponsorkit.

```rust,no_run
# async fn run(token: &str) -> Result<(), sponsorkit::Error> {
use sponsorkit::{ErrorCode, Targets, server::verify_session};

match verify_session(token, &Targets::github("octocat")).await {
    Ok(fc) => { let _is_supporter = !fc.active().is_empty(); }
    Err(e) if e.code() == ErrorCode::SessionInvalid => { /* 401 */ }
    Err(e) if e.code() == ErrorCode::TargetsMismatch => { /* token for another app */ }
    Err(e) => return Err(e),
}
# Ok(()) }
```

`server::verify_session_with(token, &targets, VerifyOptions { api_base_url, http_client, request_timeout })`
overrides the API origin (default `https://api.sponsorkit.io`), reuses an HTTP client or changes the 30 s request timeout
(`Duration::ZERO` disables it). It never touches local storage. When the answer cannot be
verified (API unreachable, timed out, 5xx, 429) it fails with `network_error`;
on 429, `e.retry_after()` says how long to wait.

## Local storage

One JSON file per target set, `<targets_hash>.json` (PROTOCOL §8), shared with the other
Sponsorkit SDKs: `{ "v": 1, "sessionToken", "cache": { "result", "storedAt" }, "nags" }`.
Writes are atomic (temp file + rename); the directory is `0700` and files `0600` on Unix.
Reads never fail: an unparseable file, invalid UTF-8, a wrong type, a bad timestamp, a
`null` list, a non-object contribution or a token that is not `sks_` followed by printable
ASCII counts as absent. Timestamps with any number of fractional-second digits are accepted.

## Development

```sh
cd sdks/rust
cargo test                                # unit tests + the conformance suite (needs `bun` on PATH)
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

`tests/conformance.rs` has one test per scenario id of `sdks/conformance/scenarios.json`
(`-` becomes `_`), run against `bun sdks/conformance/server.ts`. The harness
(`tests/common/mod.rs`) always passes `configure.env` as the `env` override, passes
`siteBaseUrl`, `devChecks`, `signInTimeout` and `interactive` only when a scenario sets
them (`siteBaseUrl: ""` is passed and counts as unset), reads `$SITE_BASE_URL` from
`GET /__control` → `siteBaseUrl` (the fake server's separate site listener), checks the
optional `server` (`api` / `site`) of expected requests against the request log, sets
`processEnv` in the real process environment for the scenario, cancels `signIn` and
`openCheckout` through a `CancellationToken` after `cancelAfter`, and matches
`expect.error` against `{ code, retryAfter }` (from `Error::retry_after()`).

## License

MIT
