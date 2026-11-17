---
title: Configuring the Rust SDK
description: Every sponsorkit::Options field with its default, the per-call GetOptions, the environment variables and the exported constants.
sidebar_label: Configuration
order: 10
---

All configuration goes into `sponsorkit::Options`, passed to `Sponsorkit::new`. `Options` is a plain struct with
public fields and a `Default` implementation, so you set what you need and write `..Default::default()` for the
rest. `new` validates everything up front and does no I/O: nothing touches the network or the disk until you call
a method.

```rust title="src/main.rs"
use std::time::Duration;

use sponsorkit::{Options, SignInMethod, Sponsorkit};

fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        opencollective: Some("my-collective".into()),
        app_name: Some("my-cli".into()),
        cache_ttl: Some(Duration::from_secs(6 * 3600)), // contributions rarely change
        sign_in_method: SignInMethod::Auto,             // loopback, falling back to paste-back
        sign_in_timeout: Some(Duration::from_secs(180)),
        request_timeout: Some(Duration::from_secs(10)),
        ..Default::default()
    })?;
    println!("{}", sk.targets().param()); // github:octocat,opencollective:my-collective
    Ok(())
}
```

`None` means "use the default" throughout.

## Options

### Targets and identity

| Field | Type | Default | Meaning |
|---|---|---|---|
| `github` | `Option<String>` | `None` | The GitHub user or organization login that receives sponsorships. |
| `opencollective` | `Option<String>` | `None` | The Open Collective slug that receives contributions. |
| `app_name` | `Option<String>` | `None` | Shown on the consent page as "*app_name* says it is…". At most 64 characters; an empty string counts as unset. |

At least one of `github` and `opencollective` is required. Accounts are trimmed and lowercased, and must be valid
logins or slugs; see [targets](../../concepts/targets.md). The target set is sealed into every session, so
changing it later signs users out of your app ([why](../../concepts/targets.md#target-sets-are-sealed-into-sessions)).
`sk.targets()` returns the canonical [`TargetSet`](/docs/reference/rust/targetset).

### Caching, storage and network

| Field | Type | Default | Meaning |
|---|---|---|---|
| `cache_ttl` | `Option<Duration>` | 1 hour | How long a result is served from the local cache without calling the API. Values below 60 seconds are raised to 60 seconds. Per call, [`GetOptions`](#getoptions) overrides it without the minimum. |
| `storage_dir` | `Option<PathBuf>` | per-user config directory | Directory of the state file. The default is `$XDG_CONFIG_HOME/sponsorkit` (else `~/.config/sponsorkit`) on Linux, `~/Library/Application Support/sponsorkit` on macOS and `%APPDATA%\sponsorkit` on Windows. If none can be determined (for example `HOME` is unset), the session is kept in memory for the life of the client; the SDK never writes to the working directory. See [where state is kept](platform-notes.md#where-state-is-kept). |
| `api_base_url` | `Option<String>` | `https://sponsorkit.io` | The API origin, for [self-hosting](../../reference-http/self-hosting.md) and tests. Must be an `http` or `https` URL with a host; a trailing `/` is removed. |
| `request_timeout` | `Option<Duration>` | 30 seconds | Bounds each HTTP request, including reading the body. `Some(Duration::ZERO)` disables it. A timeout counts as a network failure: `get_financial_contribution` serves the stale cache, `sign_in` fails with `network_error`. |

The SDK uses its own `reqwest` client (rustls, user agent `sponsorkit-rust/<version>`); you can't pass one to
the client. [`server::verify_session_with`](backend-verification.md#options) does accept one.

### Sign-in and checkout

| Field | Type | Default | Meaning |
|---|---|---|---|
| `sign_in_method` | `SignInMethod` | `SignInMethod::Auto` | `Auto`, `Loopback` or `Paste`. See [choosing a flow](sign-in.md#how-auto-chooses). |
| `sign_in_timeout` | `Option<Duration>` | 300 seconds | How long a sign-in waits for the user, and the sign-in phase of `open_checkout`. Exceeding it fails with `timeout`. |
| `open_browser` | `Option<OpenBrowserHook>` | the system browser | Opens a URL for the user. Returning an error makes `Auto` fall back to paste-back. See [hooks](sign-in.md#custom-browser-and-prompt). |
| `prompt_for_code` | `Option<PromptForCodeHook>` | read a line from stdin | Asks for the paste-back code; receives the URL the user must open. |
| `checkout_poll_interval` | `Option<Duration>` | 60 seconds | How often `open_checkout` polls for the new contribution. Per call, `CheckoutOptions::poll_interval` overrides it. |

The hook types are `Arc`'d closures that return a boxed future:

```rust
pub type OpenBrowserHook = Arc<dyn Fn(String) -> BoxFuture<std::io::Result<()>> + Send + Sync>;
pub type PromptForCodeHook = Arc<dyn Fn(String) -> BoxFuture<std::io::Result<String>> + Send + Sync>;
pub type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send + 'static>>;
```

### Testing and environment

| Field | Type | Default | Meaning |
|---|---|---|---|
| `mock` | `Option<Mock>` | `None` (or `SPONSORKIT_MOCK`) | Deterministic data with no network and no disk access: `Mock::Preset(MockPreset::ActiveMonthly)` (or `MockPreset::ActiveMonthly.into()`) or `Mock::Contributions(vec![…])`. Beats `SPONSORKIT_MOCK`. See [testing](testing.md#mock-mode). |
| `env` | `Option<HashMap<String, String>>` | the process environment | Where the five variables below are read from. When `Some`, it **replaces** the process environment for them; it isn't merged. |
| `dev_checks` | `Option<bool>` | on when `SPONSORKIT_DEV_CHECKS` is set | Checks once per process that your targets exist. See [the dev-time target check](#the-dev-time-target-check). |
| `interactive` | `Option<bool>` | stdout and stderr are both terminals | Overrides terminal detection for the [nag](nag.md). `Some(false)` means nags are never due unless forced. |
| `restart` | `bool` | `false` | Calls `Sponsorkit::reset_process_state()` before constructing, as if the process had restarted. For tests. |

## Validation

`Sponsorkit::new` returns `Err` with [`ErrorCode::InvalidConfig`](errors.md#error-codes) when:

- neither `github` nor `opencollective` is set, or a target isn't a valid login or slug (checked even when
  `SPONSORKIT_DISABLE` is set, so the mistake doesn't hide);
- `app_name` is longer than 64 characters;
- `api_base_url` isn't an `http(s)` origin;
- the mock preset (from `SPONSORKIT_MOCK`) is unknown.

A missing or unwritable storage directory is **not** an error at construction. If the SDK can't write its state
file later, `sign_in` and `sign_out` fail with `invalid_config`, and reads carry on without the cache.

## `GetOptions`

`get_financial_contribution` takes a `GetOptions`:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `cache_ttl` | `Option<Duration>` | the instance's `cache_ttl` | Overrides the cache TTL for this call. Not raised to 60 seconds; `Some(Duration::ZERO)` always asks the API, unless a `Retry-After` is in force. |

`GetOptions::fresh()` is shorthand for `GetOptions { cache_ttl: Some(Duration::ZERO) }`. See
[caching and freshness](contributions.md#caching-and-freshness).

The other per-call option structs are [`SignInOptions`](sign-in.md#signinoptions),
[`CheckoutOptions`](checkout.md#options), [`NagOptions`](nag.md#options) and
[`VerifyOptions`](backend-verification.md#options).

## Environment variables

| Variable | Effect |
|---|---|
| `SPONSORKIT_DISABLE` | Turns the SDK into a no-op: no network, no disk. Reads return `disabled: true`, nags are never due, `sign_in` and `open_checkout` fail with `disabled`. Beats mock mode. |
| `SPONSORKIT_MOCK` | Selects a mock preset by name, such as `active-monthly`. The `mock` option wins over it. |
| `SPONSORKIT_NO_NAG` | Nags are never due (unless forced). |
| `SPONSORKIT_DEV_CHECKS` | Turns on the dev-time target check. The `dev_checks` option wins over it. |
| `CI` | Nags are never due (unless forced). |

A variable counts as **set** when it's non-empty and not `0` or `false` (in any letter case). They're read once,
in `Sponsorkit::new` (`SPONSORKIT_DISABLE`, `SPONSORKIT_MOCK`, `SPONSORKIT_DEV_CHECKS`) or when a nag is checked
(`SPONSORKIT_NO_NAG`, `CI`). To control them without touching the process environment, pass `env`:

```rust title="src/main.rs"
use std::collections::HashMap;

use sponsorkit::{Options, Sponsorkit};

fn main() -> Result<(), sponsorkit::Error> {
    // Only these variables are read from `env`; the process environment is ignored for them.
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        env: Some(HashMap::from([("SPONSORKIT_DISABLE".to_string(), "1".to_string())])),
        ..Default::default()
    })?;
    assert!(sk.is_disabled());
    Ok(())
}
```

## The dev-time target check

A typo in a target fails quietly in production: nobody can contribute to an account that doesn't exist, so every
result is simply empty. The dev-time check catches it early. When it's on, the first async call in the process
(`get_financial_contribution`, `sign_in`, `open_checkout`, or a nag) asks `GET /api/v1/targets` whether your
targets exist and have a sponsorship listing, and fails with `invalid_config` if one doesn't:

```text
sponsorkit: These targets do not exist or have no sponsorship listing: github:octocta (invalid_config)
```

The answer is remembered for the process and target set. If the API can't be reached, the check is skipped
rather than failing. Mock mode and `SPONSORKIT_DISABLE` skip it too.

Rust has no implicit "development build" signal the SDK could rely on, so the check is **off** unless you opt in.
Turn it on for debug builds only:

```rust title="src/main.rs"
use sponsorkit::{Options, Sponsorkit};

fn main() -> Result<(), sponsorkit::Error> {
    let _sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        dev_checks: Some(cfg!(debug_assertions)), // on in `cargo run`, off in `--release`
        ..Default::default()
    })?;
    Ok(())
}
```

or set `SPONSORKIT_DEV_CHECKS=1` while you develop.

## Constants

| Constant | Value | Meaning |
|---|---|---|
| `DEFAULT_API_BASE_URL` | `"https://sponsorkit.io"` | Default `api_base_url`. |
| `DEFAULT_CACHE_TTL` | 1 hour | Default `cache_ttl`. |
| `MIN_CACHE_TTL` | 60 seconds | Smallest `Options::cache_ttl`. |
| `DEFAULT_REQUEST_TIMEOUT` | 30 seconds | Default `request_timeout` (also for `verify_session`). |
| `DEFAULT_SIGN_IN_TIMEOUT` | 300 seconds | Default `sign_in_timeout`. |
| `DEFAULT_CHECKOUT_POLL_INTERVAL` | 60 seconds | Default `checkout_poll_interval`. |
| `DEFAULT_CHECKOUT_TIMEOUT` | 10 minutes | Default `CheckoutOptions::timeout`. |
| `MAX_RETRY_AFTER` | 24 hours | Longer `Retry-After` values from the API are clamped to this. |
| `MOCK_PRESETS_JSON` | the preset file | The embedded mock preset data, shared by every SDK. |

The time constants are `std::time::Duration`s. All are listed in the
[API reference](/docs/reference/rust#constants).
