---
title: Reading contributions in Rust
description: get_financial_contribution, the ContributionResult it returns, the filter helpers, and how caching and staleness work.
sidebar_label: Contributions
order: 30
---

`get_financial_contribution` answers "what has the current user contributed to my targets?". It's safe to call on
every start of your app:

- **Signed out:** it returns `signed_in: false` right away, with no request (apart from the opt-in
  [dev-time target check](configuration.md#the-dev-time-target-check), which runs once per process).
- **Signed in:** it serves the local cache while it's younger than `cache_ttl` (1 hour by default), and otherwise
  asks Sponsorkit.
- **Offline, failing or rate limited:** it returns the cached result marked `stale`, or an empty signed-in result
  if nothing is cached. It never returns an error for network or server problems.

Its only error is `invalid_config` from the opt-in [dev-time target check](configuration.md#the-dev-time-target-check),
so in practice `?` on it never fires in production.

```rust title="src/main.rs"
use sponsorkit::{GetOptions, Options, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        opencollective: Some("my-collective".into()),
        ..Default::default()
    })?;

    let fc = sk.get_financial_contribution(GetOptions::default()).await?;
    if !fc.signed_in {
        println!("Not signed in.");
    }
    for c in &fc.contributions {
        println!(
            "{} {:?} {}: {:.2} {} ({})",
            c.provider,
            c.kind,
            c.status,
            c.amount.value as f64 / 100.0,
            c.amount.currency,
            c.frequency
        );
    }
    Ok(())
}
```

With `SPONSORKIT_MOCK=active-monthly` this prints `github Recurring active: 5.00 USD (monthly)`.

## `ContributionResult`

| Field | Type | Meaning |
|---|---|---|
| `signed_in` | `bool` | A supporter is signed in on this machine. |
| `disabled` | `bool` | `SPONSORKIT_DISABLE` is set; apart from `targets`, everything else is empty. |
| `mock` | `bool` | This is [mock data](testing.md#mock-mode). |
| `targets` | `Vec<String>` | Your canonical target strings, such as `github:octocat`. |
| `supporter` | `Option<Supporter>` | The signed-in person: a pairwise `id` (`sup_…`) and their `identities`. |
| `contributions` | `Vec<Contribution>` | Every contribution to your targets, in any status. |
| `fetched_at` | `Option<String>` | When Sponsorkit fetched the data from the providers (ISO 8601). |
| `stale` | `bool` | Some data may be outdated, because a provider or the API couldn't be reached. |
| `from_cache` | `bool` | The whole result came from the local cache. |
| `unavailable` | `Option<Vec<Provider>>` | Providers the API couldn't query this time. |

Each `Contribution` has:

| Field | Type | Meaning |
|---|---|---|
| `id` | `String` | Stable id, `con_<provider>_…`. |
| `provider` | `Provider` | `Provider::GitHub` or `Provider::OpenCollective`. |
| `target` | `String` | Which of your targets it's for, such as `github:octocat`. |
| `sponsor` | `SponsorEntity` | Who pays: `kind` (`SponsorType::User` or `Organization`), `provider`, `id`, `handle`. |
| `via` | `Via` | `Via::Direct`, or `Via::Organization` when an organization the user belongs to pays. See [organizations](../../concepts/organizations.md). |
| `kind` | `Kind` | `Kind::Recurring` or `Kind::OneTime`. |
| `frequency` | `Frequency` | `Frequency::OneTime`, `Monthly` or `Yearly`. |
| `status` | `Status` | `Active`, `Paused`, `Cancelled`, `Paid`, `Refunded`, `Disputed`, `Failed`, `Pending`, or `Other(String)` for a value this SDK version doesn't know. See [statuses](../../concepts/statuses.md). |
| `amount` | `Money` | `value` in minor units (`500` is $5.00) and an uppercase ISO 4217 `currency`. GitHub hides some amounts; they're `0 USD` with no tier. |
| `tier` | `Option<Tier>` | The provider tier (`id`, `name`), if any. |
| `flags` | `Vec<Flag>` | Such as `Flag::ViaPatreon` for a GitHub sponsorship paid through Patreon. |
| `private` | `bool` | The provider marks it private or incognito. |
| `started_at`, `ended_at` | `Option<String>` | ISO 8601 timestamps. |
| `last_charged_at`, `next_charge_at`, `total_contributed` | `Option<…>` | Open Collective only. |

`Status` and `Flag` are `#[non_exhaustive]` and keep unknown values in `Other(String)`, so a new status from a
provider never breaks deserialization. A `match` on them needs a `_` arm. `contribution.is_active()` is
shorthand for `status == Status::Active`.

All of these types implement `serde::Serialize` and `Deserialize` with the same camelCase JSON as the HTTP API,
so `serde_json::to_string(&fc)` gives exactly what [`GET /api/v1/contributions`](../../reference-http/protocol.md#contributions)
returns. Every field and method is listed in the API reference under
[`ContributionResult`](/docs/reference/rust/contributionresult) and [`Contribution`](/docs/reference/rust/contribution).

## Helpers

The helpers filter `contributions` and return `Vec<&Contribution>`. They never add amounts up across providers or
currencies; that's your call.

| Method | Returns contributions that are |
|---|---|
| `fc.active()` | `status == Status::Active` |
| `fc.recurring()` | `kind == Kind::Recurring`, in any status |
| `fc.one_time()` | `kind == Kind::OneTime`, in any status |
| `fc.by_provider(Provider::GitHub)` | through that provider |
| `fc.direct()` | `via == Via::Direct` (paid by the user, not an organization) |

Write your rule as a small function, so you can [test it](testing.md) with mock data:

```rust title="src/rules.rs"
use sponsorkit::{ContributionResult, Frequency, Provider, Status};

/// At least $5 a month through GitHub Sponsors, paid by the user (not their employer).
pub fn sponsors_personally(fc: &ContributionResult) -> bool {
    fc.by_provider(Provider::GitHub).iter().any(|c| {
        c.status == Status::Active
            && c.via == sponsorkit::Via::Direct
            && c.frequency == Frequency::Monthly
            && c.amount.currency == "USD"
            && c.amount.value >= 500
    })
}

/// Anyone who ever contributed anything, including one-time payments.
pub fn ever_contributed(fc: &ContributionResult) -> bool {
    fc.contributions.iter().any(|c| matches!(c.status, Status::Active | Status::Paid | Status::Cancelled))
}
```

## Caching and freshness

The SDK keeps the last result in the [state file](platform-notes.md#where-state-is-kept) and serves it while it's
younger than the TTL. Contributions rarely change, and the API allows one refresh per minute per session, so the
cache keeps your app fast and within limits. The details are in [caching](../../concepts/caching.md).

| Situation | What you get |
|---|---|
| Cache younger than the TTL | The cached result, `from_cache: true`. No request. |
| Fresh answer from Sponsorkit | `from_cache: false`. The cache is updated. |
| One provider unavailable | Fresh data for the others; the unavailable provider's cached contributions are merged in, `stale: true`, and `unavailable` lists it. |
| Network error, request timeout, 5xx, 429 | The cached result with `from_cache: true, stale: true`, or `signed_in: true, stale: true` with no contributions when nothing is cached. |
| `401` from the API (session revoked or expired) | The session and cache are cleared and you get the signed-out result. |

After a `429`, the SDK honours the API's `Retry-After` (whole seconds, clamped to 24 hours; 60 seconds if the
header is missing or invalid) for the rest of the process, serving the cache without asking again.

Change the TTL for one call with `GetOptions`:

```rust title="src/main.rs"
use std::time::Duration;

use sponsorkit::{GetOptions, Options, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options { github: Some("octocat".into()), ..Default::default() })?;

    // A `status` command: skip the cache, the user wants to see a change they just made.
    let fc = sk.get_financial_contribution(GetOptions::fresh()).await?;
    if fc.stale {
        eprintln!("Couldn't reach Sponsorkit; showing what we knew as of {}.", fc.fetched_at.as_deref().unwrap_or("never"));
    }

    // Or accept data up to 5 minutes old for this one call.
    let _fc = sk.get_financial_contribution(GetOptions { cache_ttl: Some(Duration::from_secs(300)) }).await?;

    // The result serializes to the same JSON as the HTTP API (camelCase keys).
    println!("{}", serde_json::to_string_pretty(&fc).expect("serializable"));
    Ok(())
}
```

The last line needs `serde_json` in your dependencies (`cargo add serde_json`); drop it if you don't print JSON.

`GetOptions::fresh()` still respects a `Retry-After` in force, and still falls back to the cache when the request
fails, so it's safe to use in a command the user runs by hand. Avoid it in code that runs on every start.

:::tip[Should a stale result unlock a feature?]
Usually yes. A supporter whose Wi-Fi is down shouldn't lose what they paid for, and the cached result was true a
short while ago. If you need a live, trustworthy answer (for example on a server), use
[backend verification](backend-verification.md), which does fail when Sponsorkit can't be reached.
:::

## Disabled and mock results

With `SPONSORKIT_DISABLE` set, every call returns `disabled: true` with nothing else, and does no I/O. In mock
mode, results have `mock: true`, `fetched_at: None`, `stale: false` and `from_cache: false`. Both skip the cache
and the dev-time check.
