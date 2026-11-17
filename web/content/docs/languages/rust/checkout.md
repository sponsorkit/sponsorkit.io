---
title: Checkout in Rust
description: Send users to contribute with checkout_url for links and open_checkout to open the checkout and wait for the new contribution.
sidebar_label: Checkout
order: 40
---

There are two ways to send someone to contribute:

| | `checkout_url(&options)` | `open_checkout(options)` |
|---|---|---|
| Returns | `Result<String>` | `Result<CheckoutOutcome>` (async) |
| Signs in | No | Yes, first, if the user isn't signed in |
| Network or browser | None: synchronous and offline | Opens the browser, then polls Sponsorkit |
| Use it for | Nags, `--help` text, READMEs, "Sponsor" links in a UI | A `sponsor` command or button that should thank the user when they're done |

Both send the user to Sponsorkit's checkout page, which forwards them to GitHub Sponsors or Open Collective.
Payment always happens on the provider's own site; Sponsorkit never handles money. The flow is described in the
[checkout guide](../../guides/checkout.md).

## Options

Both methods take a `CheckoutOptions`. The first four fields shape the checkout page; the rest only apply to
`open_checkout`.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `provider` | `Option<Provider>` | `None`: the page asks | Preselects GitHub Sponsors or Open Collective. Must be one of your targets' providers. The page never silently switches provider. |
| `amount` | `Option<i64>` | none | Suggested amount in minor units (`500` is $5.00). Must be positive. |
| `currency` | `Option<String>` | none | Three-letter ISO 4217 code such as `"USD"`; it's uppercased. GitHub Sponsors only accepts USD. |
| `frequency` | `Option<Frequency>` | none | `Frequency::OneTime`, `Monthly` or `Yearly` (Open Collective only). |
| `timeout` | `Option<Duration>` | 10 minutes | `open_checkout` only: how long to poll for the new contribution once the checkout page is open. |
| `poll_interval` | `Option<Duration>` | `Options::checkout_poll_interval` (60 seconds) | `open_checkout` only: how often to poll. The API allows one refresh per minute per session, so values under 60 seconds only make sense against a fake API in tests. |
| `cancel` | `Option<CancellationToken>` | `None` | `open_checkout` only: stops waiting, in the sign-in or the polling phase. |
| `sign_in_method` | `Option<SignInMethod>` | `Options::sign_in_method` | `open_checkout` only: the [sign-in flow](sign-in.md#how-auto-chooses) to use when the user is signed out. |

An unconfigured `provider`, an `amount` of zero or less, or a `currency` that isn't three ASCII letters is
rejected with `invalid_config` by both methods.

## `checkout_url`

```rust title="src/main.rs"
use sponsorkit::{CheckoutOptions, Frequency, Options, Provider, Sponsorkit};

fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        opencollective: Some("my-collective".into()),
        ..Default::default()
    })?;

    // Let the page offer every provider:
    println!("{}", sk.checkout_url(&CheckoutOptions::default())?);
    // https://sponsorkit.io/checkout?targets=github%3Aoctocat%2Copencollective%3Amy-collective

    // Suggest $10 a year through Open Collective:
    let url = sk.checkout_url(&CheckoutOptions {
        provider: Some(Provider::OpenCollective),
        amount: Some(1000),
        currency: Some("usd".into()), // uppercased in the URL
        frequency: Some(Frequency::Yearly),
        ..Default::default()
    })?;
    println!("{url}");
    Ok(())
}
```

`checkout_url` is a plain function of your targets and options: it's synchronous, does no I/O, works while the
SDK is disabled, and returns the same URL every time. The link carries no sign-in, so after paying, the user
signs in (for example with your `login` command) for your app to see the contribution.

## `open_checkout`

`open_checkout` is the full flow:

1. **Signed out:** it signs the user in first, through the checkout page itself, so they see one continuous flow
   and the SDK can tell their new contribution apart from old ones. This phase is bounded by
   `Options::sign_in_timeout`.
2. It opens the checkout page in the browser. If the browser can't be opened, it prints the URL to stderr.
3. It polls `get_financial_contribution` (bypassing the cache) every `poll_interval` until a contribution appears
   that is new or different from before, for at most `timeout`.

```rust title="src/main.rs"
use std::time::Duration;

use sponsorkit::{CancellationToken, CheckoutOptions, CheckoutOutcome, ErrorCode, Frequency, Options, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options { github: Some("octocat".into()), app_name: Some("my-cli".into()), ..Default::default() })?;

    let cancel = CancellationToken::new();
    let on_ctrl_c = cancel.clone();
    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            on_ctrl_c.cancel();
        }
    });

    let outcome = sk
        .open_checkout(CheckoutOptions {
            frequency: Some(Frequency::Monthly),
            amount: Some(500),
            timeout: Some(Duration::from_secs(15 * 60)),
            cancel: Some(cancel),
            ..Default::default()
        })
        .await;

    match outcome {
        Ok(CheckoutOutcome::Contributed { contribution }) => {
            println!("Thank you! Your {} contribution is {}.", contribution.frequency, contribution.status);
        }
        Ok(CheckoutOutcome::Unknown) => println!("Nothing yet. It can take a minute to show up; try `my-cli status`."),
        Err(e) if e.code() == ErrorCode::AccessDenied => println!("Sign-in was declined, so nothing was opened."),
        Err(e) => return Err(e),
    }
    Ok(())
}
```

`tokio::signal` needs Tokio's `signal` feature.

### The outcome

| `CheckoutOutcome` | Meaning |
|---|---|
| `Contributed { contribution }` | A new or changed contribution was detected. `contribution` is a `Box<Contribution>`; `outcome.contribution()` returns it as an `Option<&Contribution>`. |
| `Unknown` | Nothing was detected before `timeout`, or `cancel` fired, in either phase. |

`Unknown` doesn't mean the user didn't pay: some payments take a while to reach the provider's API, and the user
may simply have closed the tab. Tell them it may take a minute, and let them check again later, for example with
`get_financial_contribution(GetOptions::fresh())`.

`CheckoutOutcome` serializes as `{"status":"contributed","contribution":{…}}` or `{"status":"unknown"}`, like
the other SDKs.

### Errors

Timeouts and cancellation are reported as `Unknown`, not as errors. `open_checkout` returns `Err` for:

- `disabled`, when `SPONSORKIT_DISABLE` is set;
- `invalid_config`, for invalid options (see above) or a failed [dev-time check](configuration.md#the-dev-time-target-check);
- the [sign-in errors](sign-in.md#errors) when the user was signed out, including `timeout` when signing in
  takes longer than `sign_in_timeout`, and `access_denied` when they decline.

Dropping the future (through `tokio::time::timeout` or `select!`) also stops it, without a result.

## Mock mode

In mock mode, `open_checkout` returns `Contributed` at once with a simulated contribution built from your
options: provider and target from `provider` (else your first target), `amount` and `currency` (500 USD by
default), `frequency` (monthly by default), and status `Paid` for one-time or `Active` otherwise. The instance
becomes signed in and later results include the contribution. See [testing](testing.md#mock-mode).
