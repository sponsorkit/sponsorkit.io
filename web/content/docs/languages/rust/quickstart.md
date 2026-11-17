---
title: Rust quickstart
description: Build a small Rust CLI that checks for a contribution, signs supporters in, opens checkout and nags politely.
sidebar_label: Quickstart
order: 5
---

This page builds `my-cli`, a command-line tool with four commands:

- `my-cli` does its normal work and, every 10 runs or 7 days, asks people who don't contribute yet for support;
- `my-cli login` signs the user in with GitHub or Open Collective;
- `my-cli sponsor` opens the checkout and waits until the new contribution shows up;
- `my-cli logout` forgets the session on this machine.

## Create the project

```bash title="Terminal"
cargo new my-cli
cd my-cli
cargo add sponsorkit
cargo add tokio --features macros,rt-multi-thread
```

:::note[Pre-release]
`sponsorkit` isn't on crates.io yet, so `cargo add sponsorkit` fails with "could not be found in registry index"
for now. Until the first release, add it from the repository instead:

```bash title="Terminal"
cargo add sponsorkit --git https://github.com/sponsorkit/sponsorkit.io --branch main
```

The [Git and Local path tabs](index.md#install) show the same thing in `Cargo.toml`.
:::

## Write the program

Replace `octocat` and `my-collective` with the accounts you receive sponsorships on. You need at least one of
the two.

```rust title="src/main.rs"
use std::process::ExitCode;
use std::time::Duration;

use sponsorkit::{
    CheckoutOptions, CheckoutOutcome, ContributionResult, ErrorCode, Frequency, GetOptions, NagOptions, Options,
    SignInOptions, Sponsorkit,
};

/// Your rule: an active contribution of at least $5 in USD.
fn is_supporter(fc: &ContributionResult) -> bool {
    fc.active().iter().any(|c| c.amount.currency == "USD" && c.amount.value >= 500)
}

#[tokio::main]
async fn main() -> ExitCode {
    let sk = match Sponsorkit::new(Options {
        github: Some("octocat".into()),
        opencollective: Some("my-collective".into()),
        app_name: Some("my-cli".into()),
        ..Default::default()
    }) {
        Ok(sk) => sk,
        Err(e) => {
            // Only invalid_config: a malformed target or option. Fix it and rebuild.
            eprintln!("{e}");
            return ExitCode::FAILURE;
        }
    };

    let command = std::env::args().nth(1).unwrap_or_default();
    let result = match command.as_str() {
        "login" => login(&sk).await,
        "sponsor" => sponsor(&sk).await,
        "logout" => sk.sign_out().await.map(|()| println!("Signed out on this machine.")),
        _ => run(&sk).await,
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

/// The app's normal work, plus a polite nag every 10 runs or 7 days.
async fn run(sk: &Sponsorkit) -> Result<(), sponsorkit::Error> {
    println!("Doing the work my-cli does...");

    let nag = sk.nag(NagOptions::new("my-cli", 10).or_every(Duration::from_secs(7 * 24 * 3600)));
    if nag.due(|fc| !is_supporter(fc)).await {
        let url = sk.checkout_url(&CheckoutOptions { frequency: Some(Frequency::Monthly), ..Default::default() })?;
        eprintln!("\nEnjoying my-cli? Support it: {url}");
        eprintln!("Already a supporter? Run `my-cli login`.");
        nag.shown().await;
    }
    Ok(())
}

/// `my-cli login`: sign in with the account you contribute from.
async fn login(sk: &Sponsorkit) -> Result<(), sponsorkit::Error> {
    match sk.sign_in(SignInOptions::default()).await {
        Ok(fc) if is_supporter(&fc) => println!("Signed in. Thank you for supporting my-cli!"),
        Ok(_) => println!("Signed in. No active contribution yet: `my-cli sponsor` changes that."),
        Err(e) if e.code() == ErrorCode::AccessDenied => println!("No problem, maybe later."),
        Err(e) => return Err(e),
    }
    Ok(())
}

/// `my-cli sponsor`: open the checkout and wait for the new contribution.
async fn sponsor(sk: &Sponsorkit) -> Result<(), sponsorkit::Error> {
    let fc = sk.get_financial_contribution(GetOptions::default()).await?;
    if is_supporter(&fc) {
        println!("You already support my-cli. Thank you!");
        return Ok(());
    }
    println!("Opening the checkout in your browser...");
    let options = CheckoutOptions { frequency: Some(Frequency::Monthly), amount: Some(500), ..Default::default() };
    match sk.open_checkout(options).await? {
        CheckoutOutcome::Contributed { contribution: c } => {
            println!("Thank you! {:.2} {} ({})", c.amount.value as f64 / 100.0, c.amount.currency, c.frequency);
        }
        CheckoutOutcome::Unknown => println!("No new contribution showed up yet. Run `my-cli sponsor` again any time."),
    }
    Ok(())
}
```

## What each part does

- **`Sponsorkit::new`** validates the options and does no I/O. It fails only with `invalid_config`, so a typo in a
  target shows up the first time you run the program.
- **`is_supporter`** is your rule. The SDK reports facts (every contribution, with provider, amount, currency,
  frequency and status) and never decides who counts as a supporter. Amounts are in minor units: `500` is $5.00.
- **The nag** counts runs on disk and is never due in CI, when output is piped, or when the user set
  `SPONSORKIT_NO_NAG`. It prints to stderr so it can't end up in output another program parses. See [nag](nag.md).
- **`login`** opens the browser and receives the sign-in on `127.0.0.1`. Over SSH or without a display it prints
  a link and asks for a code instead. See [sign-in](sign-in.md).
- **`sponsor`** signs in first if needed (so it can tell the new contribution apart), opens the checkout, then
  polls every 60 seconds for up to 10 minutes. See [checkout](checkout.md).
- **`get_financial_contribution`** never fails because Sponsorkit or the network is down: it serves the local
  cache and marks it `stale`. See [contributions](contributions.md).

## Try it without an account

Mock mode returns fixed data with no network and no disk access, so you can try every path right away:

```bash title="Terminal"
SPONSORKIT_MOCK=active-monthly cargo run -- sponsor   # "You already support my-cli. Thank you!"
SPONSORKIT_MOCK=signed-out cargo run -- login         # signs in at once, no browser
SPONSORKIT_MOCK=none cargo run -- sponsor             # simulates a new $5 monthly contribution
```

The presets are `signed-out`, `none`, `active-monthly`, `one-time`, `cancelled` and `org`; see
[testing](testing.md#mock-mode).

## Next steps

- Use the result in your app: [contributions](contributions.md) and [gate a feature](../../guides/gate-features.md).
- Ship it: users can turn Sponsorkit off with `SPONSORKIT_DISABLE=1` ([errors](errors.md#turning-sponsorkit-off)).
- Need a trustworthy answer on a server? [Backend verification](backend-verification.md).
