---
title: Test your integration
description: Test your rules with mock presets, switch Sponsorkit off with SPONSORKIT_DISABLE, and keep CI quiet.
order: 70
sidebar_label: Testing
---

Your code makes decisions from Sponsorkit's result: show an ad, unlock a feature, print a nag. Mock mode lets you
test those decisions with realistic results, without signing in, without the network and without touching the
disk.

## Mock mode

Pass a preset name as the `mock` option:

:::tabs
```ts title="mock.ts"
import { Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({ github: "octocat", mock: "active-monthly" });
const fc = await sk.getFinancialContribution();
console.log(fc.mock, fc.active().length); // true 1
```
```csharp title="Mock.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", Mock = "active-monthly" });
var fc = await sk.GetFinancialContributionAsync();
Console.WriteLine($"{fc.Mock} {fc.Active().Count}"); // True 1
```
```python title="mock.py"
from sponsorkit import Sponsorkit

sk = Sponsorkit(github="octocat", mock="active-monthly")
fc = sk.get_financial_contribution()
print(fc.mock, len(fc.active()))  # True 1
```
```go title="main.go"
package main

import (
	"context"
	"fmt"
	"log"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", Mock: sponsorkit.MockPreset("active-monthly")})
	if err != nil {
		log.Fatal(err)
	}
	fc, _ := sk.GetFinancialContribution(context.Background())
	fmt.Println(fc.Mock, len(fc.Active())) // true 1
}
```
```rust title="main.rs"
use sponsorkit::{GetOptions, MockPreset, Options, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        mock: Some(MockPreset::ActiveMonthly.into()),
        ..Default::default()
    })?;
    let fc = sk.get_financial_contribution(GetOptions::default()).await?;
    println!("{} {}", fc.mock, fc.active().len()); // true 1
    Ok(())
}
```
:::

### Presets

Every SDK ships the same presets, so a test means the same thing in every language. The contributions are made
to your first target (in canonical order), by a user with the handle `mock-user`.

| Preset | Signed in | Contributions |
|---|---|---|
| `signed-out` | no | none |
| `none` | yes | none |
| `active-monthly` | yes | $5.00 monthly, `active` |
| `one-time` | yes | $25.00 one-time, `paid` |
| `cancelled` | yes | $5.00 monthly, `cancelled` |
| `org` | yes | $10.00 monthly, `active`, from the organization `mock-org` (`via: "organization"`) |

The `supporter.id` is `sup_mock`. Mock results have `mock: true`, `fetchedAt: null` and are never `stale`.

### Custom contributions

For a case the presets don't cover (a EUR contribution, a specific tier, a `paused` status), pass your own
contributions instead of a preset name: `{ contributions: [...] }` in JavaScript and Python,
`SponsorkitMock.WithContributions(...)` in .NET, `sponsorkit.MockContributions(...)` in Go and
`Mock::Contributions(vec![...])` in Rust. The client is signed in and returns exactly those contributions. Each
one has the [contribution shape](../concepts/contributions.md).

### What mock mode does

- **No network and no disk.** Nothing is read or written; nag counters live in memory, per client instance.
- **`signIn()` resolves immediately** and the client is signed in. From `signed-out`, that means signed in with
  no contributions.
- **`openCheckout()` resolves immediately** with `{ status: "contributed" }` and a simulated contribution built
  from your options (default $5.00 USD monthly; `paid` for `one_time`). It's added to the result.
- **`signOut()`** returns to the signed-out result.

That makes it useful for demos and for building your UI too, not just for tests.

## Unit-testing your rule

Keep your rule in a function that takes the result, and test it against presets. Pass an empty `env` so that
variables set on the test machine (like `SPONSORKIT_DISABLE` or `SPONSORKIT_MOCK`) can't change the outcome:

:::tabs
```ts title="ad.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { type FinancialContribution, type MockPreset, Sponsorkit } from "@sponsorkit/sdk/node";

function showAd(fc: FinancialContribution): boolean {
  return !fc.active().some((c) => c.amount.currency === "USD" && c.amount.value >= 500);
}

function client(mock: MockPreset): Sponsorkit {
  return new Sponsorkit({ github: "octocat", mock, env: {} });
}

test("no ad for a $5/month sponsor", async () => {
  assert.equal(showAd(await client("active-monthly").getFinancialContribution()), false);
});

test("ad after cancelling", async () => {
  assert.equal(showAd(await client("cancelled").getFinancialContribution()), true);
});
```
```csharp title="AdTests.cs"
using Sponsorkit;
using Xunit;

public class AdTests
{
    static bool ShowAd(ContributionResult fc) =>
        !fc.Active().Any(c => c.Amount.Currency == "USD" && c.Amount.Value >= 500);

    static SponsorkitClient Client(string preset) => new(new SponsorkitOptions
    {
        GitHub = "octocat",
        Mock = preset,
        Environment = new Dictionary<string, string>(),
    });

    [Fact]
    public async Task NoAdForMonthlySponsor() =>
        Assert.False(ShowAd(await Client("active-monthly").GetFinancialContributionAsync()));

    [Fact]
    public async Task AdAfterCancelling() =>
        Assert.True(ShowAd(await Client("cancelled").GetFinancialContributionAsync()));
}
```
```python title="test_ad.py"
from sponsorkit import ContributionResult, MockPreset, Sponsorkit


def show_ad(fc: ContributionResult) -> bool:
    return not any(c.amount.currency == "USD" and c.amount.value >= 500 for c in fc.active())


def client(preset: MockPreset) -> Sponsorkit:
    return Sponsorkit(github="octocat", mock=preset, env={})


def test_no_ad_for_monthly_sponsor() -> None:
    assert not show_ad(client("active-monthly").get_financial_contribution())


def test_ad_after_cancelling() -> None:
    assert show_ad(client("cancelled").get_financial_contribution())
```
```go title="ad_test.go"
package myapp

import (
	"context"
	"testing"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func showAd(fc *sponsorkit.Result) bool {
	for _, c := range fc.Active() {
		if c.Amount.Currency == "USD" && c.Amount.Value >= 500 {
			return false
		}
	}
	return true
}

func result(t *testing.T, preset string) *sponsorkit.Result {
	t.Helper()
	sk, err := sponsorkit.New(sponsorkit.Options{
		GitHub: "octocat",
		Mock:   sponsorkit.MockPreset(preset),
		Env:    map[string]string{},
	})
	if err != nil {
		t.Fatal(err)
	}
	fc, err := sk.GetFinancialContribution(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return fc
}

func TestNoAdForMonthlySponsor(t *testing.T) {
	if showAd(result(t, "active-monthly")) {
		t.Error("expected no ad")
	}
}

func TestAdAfterCancelling(t *testing.T) {
	if !showAd(result(t, "cancelled")) {
		t.Error("expected an ad")
	}
}
```
```rust title="tests/ad.rs"
use std::collections::HashMap;

use sponsorkit::{ContributionResult, GetOptions, MockPreset, Options, Sponsorkit};

fn show_ad(fc: &ContributionResult) -> bool {
    !fc.active().iter().any(|c| c.amount.currency == "USD" && c.amount.value >= 500)
}

async fn result(preset: MockPreset) -> ContributionResult {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        mock: Some(preset.into()),
        env: Some(HashMap::new()),
        ..Default::default()
    })
    .unwrap();
    sk.get_financial_contribution(GetOptions::default()).await.unwrap()
}

#[tokio::test]
async fn no_ad_for_monthly_sponsor() {
    assert!(!show_ad(&result(MockPreset::ActiveMonthly).await));
}

#[tokio::test]
async fn ad_after_cancelling() {
    assert!(show_ad(&result(MockPreset::Cancelled).await));
}
```
:::

The `env` option **replaces** the process environment for Sponsorkit's variables (`SPONSORKIT_DISABLE`,
`SPONSORKIT_MOCK`, `SPONSORKIT_NO_NAG`, `SPONSORKIT_DEV_CHECKS` and `CI`); it isn't merged. It's called
`Environment` in .NET and `Env` in Go.

### Testing nags

Nags are never due in CI or without a terminal, which is exactly the situation in a test runner. To test a nag,
pass an `env` without `CI` and set `interactive: true`, or call `due()` with `force`. See
[Show a sponsor nag in a CLI](nag.md#when-its-never-due).

Nag runs are counted once per process. When a test needs a "new process", reset that memory:
`resetProcessState()` in JavaScript, `SponsorkitClient.ResetProcessState()` in .NET,
`sponsorkit.reset_process_state()` in Python, `sponsorkit.ResetProcessState()` in Go and
`Sponsorkit::reset_process_state()` (or `restart: true`) in Rust. It also forgets the dev-time target check and
any `Retry-After` back-off.

## Environment variables

These work in every SDK and need no code change, which makes them handy for manual testing, demos and CI:

| Variable | Effect |
|---|---|
| `SPONSORKIT_MOCK=<preset>` | Mock mode with that preset. The `mock` option, when set in code, wins. |
| `SPONSORKIT_DISABLE=1` | Sponsorkit is off: no network, no disk, no nags. |
| `SPONSORKIT_NO_NAG=1` | Nags are never due. Everything else works. |
| `SPONSORKIT_DEV_CHECKS=1` | Check once per process that your targets exist (`invalid_config` if not). |
| `CI=1` | Nags are never due. Set automatically by most CI systems. |

A variable counts as set when it's non-empty and not `0` or `false` (in any letter case).

```bash title="Trying it out"
SPONSORKIT_MOCK=org my-cli status        # see what an organization sponsor sees
SPONSORKIT_MOCK=signed-out my-cli        # see the nag a new user would get
SPONSORKIT_DISABLE=1 my-cli              # what your app does without Sponsorkit
```

### `SPONSORKIT_DISABLE`

Disabling beats everything, including mock mode:

- `getFinancialContribution()` returns a signed-out result with `disabled: true`, without network or disk access.
- `signIn()` and `openCheckout()` fail with `disabled`, so make sure your sign-in UI handles that error.
- `nag().due()` is always false, even with `force`.
- `isSignedIn()` returns false and `signOut()` does nothing.

Malformed targets still fail with `invalid_config` when disabled, so a typo can't hide behind the switch.

## In CI

- **Your unit tests** should use mock mode with an explicit `env`, as above, so they never touch the network
  and don't depend on the CI environment.
- **End-to-end tests of your app** can set `SPONSORKIT_MOCK` or `SPONSORKIT_DISABLE=1` for the process under test.
- **Nags** are already off, because CI systems set `CI`.

To test the real sign-in and checkout flows end to end, the SDKs accept hooks for everything that needs a person:
`apiBaseUrl` to point at a fake server, `openBrowser` to "visit" the consent page programmatically,
`promptForCode` to answer the paste-back prompt, `storageDir` for a temporary directory and, in every SDK except
Rust, `clock` to control time. The Sponsorkit repository uses exactly these hooks to run the same scenarios against every SDK, with a
fake API in [`sdks/conformance`](https://github.com/sponsorkit/sponsorkit.io/tree/main/sdks/conformance).
