---
title: Errors and cancellation in Rust
description: The sponsorkit::Error type and its ErrorCode values, which methods return what, and how to cancel sign-in and checkout with a CancellationToken or by dropping the future.
sidebar_label: Errors & cancellation
order: 80
---

The Rust SDK follows the [error contract](../../concepts/error-contract.md) every Sponsorkit SDK shares:

- **Reading never breaks your app.** `get_financial_contribution` doesn't return an error for network errors,
  outages, 5xx responses or rate limits. It reports them through `stale` (see
  [contributions](contributions.md#caching-and-freshness)).
- **Configuration mistakes fail fast**, in `Sponsorkit::new` or at the call with the bad options.
- **Actions the user asked for** (sign-in, checkout) return an error when they can't complete, so you can tell
  the user why.

## `sponsorkit::Error`

Every fallible function returns `sponsorkit::Result<T>`, an alias for `std::result::Result<T, sponsorkit::Error>`.
`Error` is a small struct; branch on its `code()`, not on the message, which is for humans and may change.

| Method | Returns | Meaning |
|---|---|---|
| `code()` | `ErrorCode` | One of the codes below. |
| `message()` | `&str` | A readable description, fine to show or log. |
| `retry_after()` | `Option<Duration>` | For `network_error` caused by a rate limit: how long Sponsorkit asked you to wait (its `Retry-After`, whole seconds, capped at 24 hours). |

`Error` implements `std::error::Error`, `Display`, `Debug` and `Clone`, and is `Send + Sync + 'static`, so `?`
converts it into `Box<dyn std::error::Error>` or `anyhow::Error`. It displays as `sponsorkit: <message> (<code>)`:

```text
sponsorkit: amount must be a positive number of minor units, got 0 (invalid_config)
```

`Error::new(code, message)` is public, for code (such as test doubles) that wants to produce the same errors.

## Error codes

`ErrorCode` is a `Copy` enum. `code.as_str()` (or `Display`) gives the wire spelling shared by all SDKs. It's
`#[non_exhaustive]`, so a `match` on it needs a `_` arm.

| `ErrorCode` | Wire value | Returned by | When |
|---|---|---|---|
| `InvalidConfig` | `invalid_config` | `new`, any call with bad options; `sign_in` and `sign_out` | Missing or malformed targets, an unknown mock preset, invalid checkout options, an unconfigured `provider`, the [dev-time check](configuration.md#the-dev-time-target-check) found a missing target, or the state file couldn't be written. |
| `Disabled` | `disabled` | `sign_in`, `open_checkout` | `SPONSORKIT_DISABLE` is set. |
| `PopupBlocked` | `popup_blocked` | never | Only the browser SDK produces it; listed for parity. |
| `AccessDenied` | `access_denied` | `sign_in`, `open_checkout` | The user declined on the provider's consent screen. |
| `InvalidState` | `invalid_state` | `sign_in`, `open_checkout` | The OAuth state expired or couldn't be verified. |
| `ProviderError` | `provider_error` | `sign_in`, `open_checkout` | The provider failed during sign-in. |
| `InvalidCode` | `invalid_code` | `sign_in`, `open_checkout` | The API rejected the sign-in code, for example a mistyped paste-back code. |
| `Cancelled` | `cancelled` | `sign_in`, `open_checkout` | `SignInOptions::cancel` fired, or nothing was entered at the paste-back prompt (also while `open_checkout` signs in). |
| `Timeout` | `timeout` | `sign_in`, `open_checkout` | Signing in took longer than `sign_in_timeout`. |
| `NetworkError` | `network_error` | `sign_in`, `open_checkout`, `verify_session` | The API couldn't be reached, timed out, or answered 5xx, 429 or something unexpected. |
| `SessionInvalid` | `session_invalid` | `verify_session` | The session token is invalid or expired. |
| `TargetsMismatch` | `targets_mismatch` | `verify_session` | The session was issued for different targets. |

What each method can return:

| Method | Errors |
|---|---|
| `Sponsorkit::new` | `invalid_config` only |
| `get_financial_contribution` | `invalid_config` from the dev-time check only; never network errors |
| `sign_in` | everything in the table except `popup_blocked`, `session_invalid` and `targets_mismatch` |
| `open_checkout` | like `sign_in`; but `CheckoutOptions::cancel` and the polling `timeout` give `Ok(CheckoutOutcome::Unknown)` instead of an error |
| `checkout_url` | `invalid_config` only |
| `sign_out` | `invalid_config`, if the state file can't be written |
| `Nag::due`, `Nag::shown` | none: `due` returns `bool`, and errors read as `false` |
| `server::verify_session` | `invalid_config`, `session_invalid`, `targets_mismatch`, `network_error` |
| `parse_iso_duration`, `Target::parse`, `"…".parse::<MockPreset>()` | `invalid_config` |

## Handling errors

```rust title="src/main.rs"
use sponsorkit::{ErrorCode, Options, SignInOptions, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let sk = Sponsorkit::new(Options { github: Some("octocat".into()), ..Default::default() })?;

    if let Err(e) = sk.sign_in(SignInOptions::default()).await {
        match e.code() {
            ErrorCode::AccessDenied | ErrorCode::Cancelled => eprintln!("No problem, maybe later."),
            ErrorCode::Timeout => eprintln!("Sign-in timed out. Try again with `my-cli login`."),
            ErrorCode::NetworkError => match e.retry_after() {
                Some(wait) => eprintln!("Sponsorkit is busy; try again in {} s.", wait.as_secs()),
                None => eprintln!("Couldn't reach Sponsorkit. Check your connection."),
            },
            ErrorCode::Disabled => {} // the user turned Sponsorkit off: stay quiet
            _ => return Err(e.into()), // invalid_config and the rest: a bug to fix
        }
    }
    Ok(())
}
```

## Rate limits and `Retry-After`

When the API answers `429`, it sends `Retry-After` in seconds. The SDK handles it differently depending on who's
waiting:

- `get_financial_contribution` serves the cache and doesn't ask again for that long (60 seconds when the header is
  missing or invalid), for the rest of the process.
- `sign_in`, `open_checkout` and `verify_session` fail with `network_error`, and `e.retry_after()` tells you how
  long to wait.

Values that aren't a non-negative whole number of seconds are ignored; values over 24 hours are capped at
`MAX_RETRY_AFTER`.

## Cancellation

Rust futures do nothing unless polled, so there are two ways to stop an SDK call:

1. **A `CancellationToken`** in `SignInOptions::cancel` or `CheckoutOptions::cancel`. The crate re-exports
   `tokio_util::sync::CancellationToken` as `sponsorkit::CancellationToken`, so you don't need `tokio-util` in
   your own dependencies. Cancelling gives you a result:

   | Method | On cancel |
   |---|---|
   | `sign_in` | `Err` with `ErrorCode::Cancelled` |
   | `open_checkout` | `Ok(CheckoutOutcome::Unknown)`, in the sign-in phase or the polling phase |

2. **Dropping the future**, for example with `tokio::time::timeout`, a `tokio::select!` branch that loses, or
   aborting the task. Everything stops, including the loopback listener, but there's no result. This works for
   every async method, including `get_financial_contribution` and `verify_session`, which don't take a token.

```rust title="src/main.rs"
use std::time::Duration;

use sponsorkit::{Options, SignInOptions, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options { github: Some("octocat".into()), ..Default::default() })?;

    // Dropping the future stops the sign-in (and its loopback listener) without a result.
    match tokio::time::timeout(Duration::from_secs(60), sk.sign_in(SignInOptions::default())).await {
        Ok(result) => {
            result?;
            println!("Signed in.");
        }
        Err(_elapsed) => println!("Gave up after a minute."),
    }
    Ok(())
}
```

A token is the better choice for Ctrl+C handling, because the user gets a clear `cancelled` result; see the
[sign-in](sign-in.md#timeouts-and-cancellation) and [checkout](checkout.md#open_checkout) examples. A cancelled
or timed-out paste-back prompt leaves the SDK's stdin reader waiting for one more line; see
[paste-back and stdin](platform-notes.md#stdin).

## Turning Sponsorkit off

Users can switch the SDK off with `SPONSORKIT_DISABLE=1`. Then nothing touches the network or the disk:

- `get_financial_contribution` returns `disabled: true` with no contributions;
- nags are never due;
- `sign_in` and `open_checkout` return `disabled`, so a `login` or `sponsor` command can say "Sponsorkit is
  turned off" instead of hanging;
- `sign_out` does nothing, `checkout_url` still returns a link, and `is_disabled()` tells you the state.

Targets are still validated, so a configuration mistake doesn't hide behind the switch.
