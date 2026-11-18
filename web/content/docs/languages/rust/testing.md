---
title: Testing with Rust
description: Test your rules with mock presets and custom contributions, make nags deterministic, drive sign-in with hooks, and keep CI quiet.
sidebar_label: Testing
order: 60
---

Three tools cover almost every test:

- **Mock mode** returns fixed results with no network and no disk access. Use it for your rules and your UI.
- **Test hooks** on `Options` (`env`, `storage_dir`, `interactive`, `restart`, `open_browser`, `prompt_for_code`,
  `api_base_url`) make the real code paths deterministic.
- **`SPONSORKIT_DISABLE`** switches the SDK off entirely, for CI and for users who don't want it.

The examples are integration tests (`tests/*.rs`) using `#[tokio::test]`, which needs Tokio's `macros` feature.

## Mock mode

Set `Options::mock` to a preset or to your own contributions:

```rust title="tests/mock.rs"
use std::collections::HashMap;

use sponsorkit::{
    CheckoutOptions, CheckoutOutcome, Contribution, Frequency, GetOptions, Kind, Mock, MockPreset, Money, Options,
    Provider, SignInOptions, SponsorEntity, SponsorType, Sponsorkit, Status, Via,
};

fn client(mock: Mock) -> Sponsorkit {
    Sponsorkit::new(Options {
        github: Some("octocat".into()),
        mock: Some(mock),
        // An empty environment, so `SPONSORKIT_DISABLE` or `CI` set on the CI runner can't change the results.
        env: Some(HashMap::new()),
        ..Default::default()
    })
    .unwrap()
}

#[tokio::test]
async fn active_monthly_supporter_gets_the_feature() {
    let sk = client(MockPreset::ActiveMonthly.into());
    let fc = sk.get_financial_contribution(GetOptions::default()).await.unwrap();
    assert!(fc.mock && fc.signed_in);
    assert_eq!(fc.active().len(), 1);
    assert_eq!(fc.active()[0].amount, Money { value: 500, currency: "USD".into() });
}

#[tokio::test]
async fn custom_contributions() {
    let big = Contribution {
        id: "con_test_1".into(),
        provider: Provider::GitHub,
        target: "github:octocat".into(),
        sponsor: SponsorEntity {
            kind: SponsorType::User,
            provider: Provider::GitHub,
            id: "1".into(),
            handle: Some("someone".into()),
        },
        via: Via::Direct,
        kind: Kind::Recurring,
        frequency: Frequency::Monthly,
        status: Status::Active,
        amount: Money { value: 2500, currency: "USD".into() },
        tier: None,
        flags: Vec::new(),
        private: false,
        started_at: None,
        ended_at: None,
        last_charged_at: None,
        next_charge_at: None,
        total_contributed: None,
    };
    let sk = client(Mock::Contributions(vec![big]));
    let fc = sk.get_financial_contribution(GetOptions::default()).await.unwrap();
    assert_eq!(fc.active()[0].amount.value, 2500);
}

#[tokio::test]
async fn sign_in_and_checkout_are_simulated() {
    let sk = client(MockPreset::SignedOut.into());
    assert!(!sk.is_signed_in());

    let fc = sk.sign_in(SignInOptions::default()).await.unwrap();
    assert!(fc.signed_in && fc.contributions.is_empty());

    let outcome = sk
        .open_checkout(CheckoutOptions { frequency: Some(Frequency::OneTime), amount: Some(1000), ..Default::default() })
        .await
        .unwrap();
    let CheckoutOutcome::Contributed { contribution } = outcome else { panic!("expected a contribution") };
    assert_eq!(contribution.status, Status::Paid);
    assert_eq!(sk.get_financial_contribution(GetOptions::default()).await.unwrap().one_time().len(), 1);

    sk.sign_out().await.unwrap();
    assert!(!sk.get_financial_contribution(GetOptions::default()).await.unwrap().signed_in);
}

#[test]
fn unknown_preset_is_invalid_config() {
    assert_eq!("gold".parse::<MockPreset>().unwrap_err().code(), sponsorkit::ErrorCode::InvalidConfig);
    assert_eq!("active-monthly".parse::<MockPreset>().unwrap(), MockPreset::ActiveMonthly);
}
```

Or select a preset without changing code, from the environment:

```bash title="Terminal"
SPONSORKIT_MOCK=one-time cargo run
```

The `mock` option wins over `SPONSORKIT_MOCK`, and `SPONSORKIT_DISABLE` wins over both. An unknown preset name
makes `Sponsorkit::new` fail with `invalid_config`. `MockPreset` parses from and displays as the preset name, and
`MockPreset::ALL` lists them all.

### Presets

Every preset uses your first target (in canonical order) as the provider and target, and a supporter with id
`sup_mock` and handle `mock-user`.

| Preset | `MockPreset` | Signed in | Contributions |
|---|---|---|---|
| `signed-out` | `SignedOut` | No | none |
| `none` | `None` | Yes | none |
| `active-monthly` | `ActiveMonthly` | Yes | $5.00 monthly, `active`, direct |
| `one-time` | `OneTime` | Yes | $25.00 one-time, `paid`, direct |
| `cancelled` | `Cancelled` | Yes | $5.00 monthly, `cancelled`, direct |
| `org` | `Org` | Yes | $10.00 monthly, `active`, paid by an organization (`Via::Organization`) |

`Mock::Contributions(vec![…])` gives a signed-in result with exactly the contributions you pass, unchanged.

### What mock mode does

- Results have `mock: true`, `fetched_at: None`, `stale: false` and `from_cache: false`.
- Nothing touches the network or the disk; state lives in memory, per client (clones share it).
- `sign_in` returns at once and signs the instance in. If it was signed out, its contributions become empty.
- `sign_out` returns at once; later results are signed out.
- `open_checkout` returns `Contributed` at once with a simulated contribution built from your options (500 USD
  monthly by default), and adds it to later results.
- `is_signed_in()` follows the mock state, and `is_mock()` returns `true`.
- Nag state lives in memory too, so run counts don't carry from one client to the next. Test nags as below.

The [mock mode guide](../../guides/mock-mode.md) covers the same presets in every language.

## Testing nags

A nag counts runs on disk and is never due in CI or without a terminal, which is exactly what you don't want in
a test. Give each test its own storage directory, an empty `env` so `CI` from the real environment is ignored,
`interactive: Some(true)`, and `restart: true` to make each client behave like a new process:

```rust title="tests/nag.rs"
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use sponsorkit::{NagOptions, Options, Sponsorkit};

/// A fresh, empty storage directory for one test.
fn temp_storage(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("my-cli-test-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    dir
}

/// One "run" of the app: a new client that forgets per-process state, like a new process.
fn next_run(dir: &Path) -> Sponsorkit {
    Sponsorkit::new(Options {
        github: Some("octocat".into()),
        storage_dir: Some(dir.to_path_buf()),
        env: Some(HashMap::new()), // ignore CI, SPONSORKIT_* from the real environment
        interactive: Some(true),   // pretend stdout and stderr are terminals
        restart: true,             // = Sponsorkit::reset_process_state()
        ..Default::default()
    })
    .unwrap()
}

#[tokio::test]
async fn nag_is_due_every_third_run() {
    let dir = temp_storage("nag");
    let mut shown = Vec::new();
    for _ in 0..6 {
        let sk = next_run(&dir);
        let nag = sk.nag(NagOptions::new("my-cli", 3));
        // Signed out, so this makes no network request.
        let due = nag.due(|fc| fc.active().is_empty()).await;
        if due {
            nag.shown().await;
        }
        shown.push(due);
    }
    assert_eq!(shown, [false, false, true, false, false, true]);
    let _ = std::fs::remove_dir_all(&dir);
}
```

:::note[Process-wide state]
`restart: true` and `Sponsorkit::reset_process_state()` reset state shared by the whole test binary: which nags
were counted in this process, the dev-time check, and `Retry-After` back-offs. Cargo runs tests in parallel
threads of one process, so keep tests that depend on this state in one test function, or run them with
`cargo test -- --test-threads=1`.
:::

## Test hooks

| `Options` field | Use it to |
|---|---|
| `env` | Control `SPONSORKIT_DISABLE`, `SPONSORKIT_MOCK`, `SPONSORKIT_NO_NAG`, `SPONSORKIT_DEV_CHECKS` and `CI` without touching the process environment. `Some(HashMap::new())` means "none of them are set". |
| `storage_dir` | Keep each test's session, cache and nag counters in a temporary directory. |
| `interactive` | Pretend stdout and stderr are (or aren't) terminals for nags. |
| `restart` | Reset per-process state before constructing, like `Sponsorkit::reset_process_state()`. |
| `api_base_url` | Point the SDK at a fake API on `127.0.0.1` (its site pages too, since `site_base_url` defaults to it). |
| `open_browser`, `prompt_for_code` | Drive sign-in without a browser or a terminal: the hook receives the URL the user would open. |
| `checkout_poll_interval`, `sign_in_timeout`, `request_timeout` | Keep end-to-end tests fast. |

The SDK's own conformance suite drives the real code paths this way against a fake API; see `tests/common/mod.rs`
in `sdks/rust` for a complete example, including a loopback sign-in completed from an `open_browser` hook.

## In CI

- **Your own tests** use mock mode or the hooks above, so they don't need network access or a Sponsorkit account.
- **Your app** running in CI (for example in an integration test that runs your binary) never shows a nag,
  because `CI` is set by every major CI provider. To be sure nothing at all happens, set `SPONSORKIT_DISABLE=1`:
  no network, no disk, and `sign_in` and `open_checkout` fail with `disabled` instead of waiting for a browser.
