---
title: Sponsorkit for Rust
description: Install the sponsorkit crate and use it from Rust CLIs, desktop apps and Tokio backends.
sidebar_label: Overview
---

The `sponsorkit` crate tells your Rust program what the current user has contributed to your GitHub Sponsors and
Open Collective accounts, signs them in, and sends them to contribute. It's written for command-line tools and
desktop apps that one person runs, and it has a helper for servers that need to check a supporter.

There's no Sponsorkit account or API key. You name the accounts you receive money on, and the SDK does the rest.

## Requirements

| | |
|---|---|
| Rust | 1.85 or later (the crate uses the 2024 edition) |
| Async runtime | Tokio 1.x, current-thread or multi-thread. The SDK has no blocking API; see [platform notes](platform-notes.md#tokio). |
| Dependencies | `reqwest` (with `rustls`, so no OpenSSL), `serde`, `serde_json`, `tokio`, `tokio-util`, `sha2`, `base64`, `getrandom` |
| Cargo features | None. There's nothing to turn on or off. |
| Operating systems | Linux, macOS and Windows for sign-in and checkout (they open the system browser). `server::verify_session` and mock mode run anywhere Tokio and `reqwest` do. |

## Install

The crate will be published on crates.io as `sponsorkit`. You also need Tokio in your own app to run async
code; `#[tokio::main]` needs the `macros` feature, plus `rt-multi-thread` for its default multi-thread flavour.

:::note[Pre-release]
`sponsorkit` hasn't been published to crates.io yet, so `cargo add sponsorkit` and `sponsorkit = "0.1"` fail
with "could not be found in registry index" for now. Until the first release, depend on the repository with the
**Git** or **Local path** tab below, or see [build from source](../../install/from-source.md#rust).
:::

::::tabs{group="cargo"}
:::tab[Git]{key="git"}
Cargo finds the crate inside the repository by its name, so you can depend on a branch, tag or commit:

```toml title="Cargo.toml"
[dependencies]
sponsorkit = { git = "https://github.com/sponsorkit/sponsorkit.io", branch = "main" }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

`Cargo.lock` records the exact commit. Use `rev = "<commit>"` instead of `branch` for a fixed version, or,
once releases are tagged, `tag = "sdks/rust/v0.1.0"`.
:::
:::tab[Local path]{key="path"}
To work against a clone of the repository:

```bash title="Terminal"
git clone https://github.com/sponsorkit/sponsorkit.io.git ../sponsorkit.io
```

```toml title="Cargo.toml"
[dependencies]
sponsorkit = { path = "../sponsorkit.io/sdks/rust" }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

See [build from source](../../install/from-source.md#rust) for running the SDK's own tests.
:::
:::tab[cargo add (after release)]{key="cargo-add"}
Once the crate is on crates.io:

```bash title="Terminal"
cargo add sponsorkit
cargo add tokio --features macros,rt-multi-thread
```
:::
:::tab[Cargo.toml (after release)]{key="cargo-toml"}
Once the crate is on crates.io:

```toml title="Cargo.toml"
[dependencies]
sponsorkit = "0.1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

`"0.1"` accepts any `0.1.x` release. Pin an exact version with `"=0.1.0"`; see
[versions & pinning](../../install/versions.md#rust).
:::
::::

## A first look

```rust title="src/main.rs"
use sponsorkit::{CheckoutOptions, Frequency, GetOptions, Options, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()), // the account you receive sponsorships on
        app_name: Some("my-cli".into()), // shown on the consent page
        ..Default::default()
    })?; // invalid_config: a malformed target or option

    // Never fails because of the network: it falls back to the cached result.
    let fc = sk.get_financial_contribution(GetOptions::default()).await?;
    if fc.signed_in && !fc.active().is_empty() {
        println!("Thank you for sponsoring my-cli!");
        return Ok(());
    }
    let link = sk.checkout_url(&CheckoutOptions { frequency: Some(Frequency::Monthly), ..Default::default() })?;
    eprintln!("Enjoying my-cli? Support it: {link}");
    Ok(())
}
```

A few things hold everywhere in the crate:

- All configuration is a plain struct with public fields. Set what you need and fill the rest with
  `..Default::default()`.
- Every fallible call returns `sponsorkit::Result<T>`, and every error is a [`sponsorkit::Error`](errors.md) with
  a machine-readable `code()`.
- `Sponsorkit` is cheap to clone (an `Arc` inside), `Send` and `Sync`, and its futures are `Send`, so you can
  share one client across tasks.

## In this section

| Page | What it covers |
|---|---|
| [Quickstart](quickstart.md) | A complete CLI with `login`, `sponsor` and `logout` commands and a nag. |
| [Configuration](configuration.md) | Every `Options` field with its default, `GetOptions`, environment variables and constants. |
| [Sign-in](sign-in.md) | Loopback and paste-back sign-in, choosing a flow, second identities, hooks, cancelling. |
| [Contributions](contributions.md) | `get_financial_contribution`, `ContributionResult`, its filter helpers, and caching. |
| [Checkout](checkout.md) | `open_checkout` and `checkout_url`. |
| [Nag](nag.md) | Asking for support every N runs or N days. |
| [Testing](testing.md) | Mock mode, deterministic nags, and test hooks. |
| [Backend verification](backend-verification.md) | Checking a supporter on your server with `server::verify_session`, with an axum example. |
| [Errors and cancellation](errors.md) | `sponsorkit::Error`, `ErrorCode`, `CancellationToken` and dropping futures. |
| [Platform notes](platform-notes.md) | Tokio, synchronous apps, where state is kept, browsers, stdin, TLS and proxies. |

The [API reference](/docs/reference/rust) lists every public type, function, method, field and constant,
generated from the crate's source and doc comments. `cargo doc --open` builds the same documentation locally;
it will also be on docs.rs once the crate is published.
