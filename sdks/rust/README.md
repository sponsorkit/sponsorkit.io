# sponsorkit (Rust)

Build GitHub Sponsors and Open Collective contributions into your Rust app or CLI.
No Sponsorkit account, no API key, no webhook: name the account(s) you receive
contributions on, ask what the current user contributes, and send them to contribute.

- Reports **facts**: every contribution to your accounts, per provider. You write the rule.
- **Never breaks your app**: if Sponsorkit, a provider or the network is down, you get the cached result.
- Sign-in through the system browser (loopback) or a pasted code on headless machines.
- Mock mode for tests, a polite nag helper, and backend verification of session tokens.

Website: <https://sponsorkit.io> · Spec: `docs/SPEC.md` · Wire protocol: `docs/PROTOCOL.md`

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
        println!("Support my-cli: {}", sk.checkout_url(&CheckoutOptions::default()));
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
| `storage_dir` | per-user config dir | Linux `$XDG_CONFIG_HOME/sponsorkit`, macOS `~/Library/Application Support/sponsorkit`, Windows `%APPDATA%\sponsorkit`. |
| `api_base_url` | `https://sponsorkit.io` | Origin of the API (self-hosting, tests). |
| `sign_in_method` | `Auto` | `Auto` (loopback, falls back to paste-back without a display, over SSH, or when the browser cannot open), `Loopback`, `Paste`. |
| `env` | process environment | Override for `SPONSORKIT_DISABLE`, `SPONSORKIT_MOCK`, `SPONSORKIT_NO_NAG`, `CI`. |
| `dev_checks` | on in debug builds | Dev-time check that the targets exist (one `GET /api/v1/targets` per process, on the first async call). |
| `checkout_poll_interval` | 60 s | How often `open_checkout` re-checks. |
| `interactive` | stdout+stderr are terminals | Override terminal detection for the nag helper. |
| `open_browser` | system browser | Hook `Fn(String) -> BoxFuture<io::Result<()>>`. |
| `prompt_for_code` | read a line from stdin | Hook `Fn(paste_url: String) -> BoxFuture<io::Result<String>>`. |
| `restart` | `false` | Reset per-process memo state first (same as `Sponsorkit::reset_process_state()`). |

An environment variable counts as **set** when it is non-empty and not `0` or `false` (case-insensitive).

### Methods

| Method | Returns | Notes |
|---|---|---|
| `get_financial_contribution(GetOptions { cache_ttl })` | `Result<ContributionResult>` | Never fails for network/server problems (see below). `GetOptions::fresh()` bypasses the cache. |
| `sign_in(SignInOptions { provider, method, cancel })` | `Result<ContributionResult>` | Loopback (5-minute timeout) or paste-back. While signed in, adds a second identity (`provider: Some(Provider::OpenCollective)`). |
| `is_signed_in()` | `bool` | Local only. |
| `open_checkout(CheckoutOptions { provider, amount, currency, frequency, timeout, poll_interval, cancel, sign_in_method })` | `Result<CheckoutOutcome>` | Signs in first if needed, opens `/checkout`, polls until a new or changed contribution appears. `Contributed { contribution }` or `Unknown` (timeout, default 10 min, or cancellation). |
| `checkout_url(&CheckoutOptions)` | `String` | Synchronous, offline link to `/checkout` without sign-in. For nags and READMEs. |
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
| No targets / malformed target / target doesn't exist (dev check) | `Err` with `ErrorCode::InvalidConfig` |
| Not signed in | Signed-out result, no network call |
| Session invalid | Token and cache cleared, signed-out result |
| One provider unavailable | Its cached contributions are merged in, `stale: true` |
| Network error, 5xx, 429 | Cached result (`from_cache: true, stale: true`), or a signed-in empty result with `stale: true`. `Retry-After` is honoured for the rest of the process. **Never an error.** |
| `SPONSORKIT_DISABLE=1` | No network or disk. `disabled: true`; nags are never due; `sign_in`/`open_checkout` fail with `Disabled`. |

`Error::code()` returns an `ErrorCode`; `ErrorCode::as_str()` gives the wire spelling shared
by all SDKs: `invalid_config`, `disabled`, `popup_blocked`, `access_denied`,
`invalid_state`, `provider_error`, `invalid_code`, `session_invalid`, `targets_mismatch`,
plus `timeout` (sign-in not completed/cancelled) and `internal` (sign-in or verification
could not reach the server, or local storage could not be written).

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

`open_checkout` takes a `tokio_util` `CancellationToken` (re-exported as
`sponsorkit::CancellationToken`) in `CheckoutOptions::cancel`. Cancelling resolves
`CheckoutOutcome::Unknown` instead of failing. Dropping the future (for example through
`tokio::time::timeout` or `tokio::select!`) also stops everything, including the loopback
listener, but yields no result.

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
    let url = sk.checkout_url(&CheckoutOptions { frequency: Some(Frequency::Monthly), ..Default::default() });
    eprintln!("Enjoying my-cli? Support it: {url}");
    nag.shown().await;
}
# }
```

- The run counter goes up once per process per `id`, on the first `due()` call (even when the predicate is false).
- `due()` is `predicate && (runs >= every || since(last_shown) >= or_every)`; `shown()` resets both.
- `due()` is always false when `SPONSORKIT_DISABLE`, `SPONSORKIT_NO_NAG` or `CI` is set, or stdout/stderr
  is not a terminal, unless `due_with(pred, DueOptions { force: true })` (force never overrides `SPONSORKIT_DISABLE`).
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
  `open_checkout` simulates a new contribution; state lives in memory per instance.
- `SPONSORKIT_DISABLE=1` beats mock mode.
- For end-to-end tests, inject `open_browser`, `prompt_for_code`, `storage_dir`,
  `api_base_url`, `env` and `checkout_poll_interval` (see `tests/common/mod.rs`).

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

`server::verify_session_with(token, &targets, VerifyOptions { api_base_url, http_client })`
overrides the origin or reuses an HTTP client. It never touches local storage.

## Local storage

One JSON file per target set, `<targets_hash>.json` (PROTOCOL §8), shared with the other
Sponsorkit SDKs: `{ "v": 1, "sessionToken", "cache": { "result", "storedAt" }, "nags" }`.
Writes are atomic (temp file + rename); the directory is `0700` and files `0600` on Unix.

## Development

```sh
cd sdks/rust
cargo test                                # unit tests + the conformance suite (needs `bun` on PATH)
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

`tests/conformance.rs` has one test per scenario id of `sdks/conformance/scenarios.json`
(`-` becomes `_`), run against `bun sdks/conformance/server.ts`.

## License

MIT
