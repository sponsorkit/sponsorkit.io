---
title: Gate a feature or show an ad
description: Turn the supporter's contributions into your own rule, such as hiding an ad or unlocking a feature for sponsors.
order: 10
---

Sponsorkit reports facts: every contribution the signed-in person (or one of their organizations) has made to
your accounts, per provider, in the provider's currency. It never decides who "counts". That rule is yours,
and this guide shows how to write it.

## The basic rule

A common rule is "hide the ad for anyone with an active contribution of at least $5". Ask for the result, then
filter it:

:::tabs
```ts title="ad.ts"
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-project" });

const fc = await sk.getFinancialContribution();
const isSupporter = fc.active().some((c) => c.amount.currency === "USD" && c.amount.value >= 500);

if (!isSupporter) {
  document.querySelector<HTMLElement>("#ad")?.removeAttribute("hidden");
}
```
```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "octocat",
    OpenCollective = "my-project",
    AppName = "my-app",
});

var fc = await sk.GetFinancialContributionAsync();
var isSupporter = fc.Active().Any(c => c.Amount.Currency == "USD" && c.Amount.Value >= 500);

if (!isSupporter)
{
    Console.WriteLine("my-app is free thanks to its sponsors: https://github.com/sponsors/octocat");
}
```
```python title="app.py"
from sponsorkit import Sponsorkit

sk = Sponsorkit(github="octocat", opencollective="my-project", app_name="my-app")

fc = sk.get_financial_contribution()
is_supporter = any(c.amount.currency == "USD" and c.amount.value >= 500 for c in fc.active())

if not is_supporter:
    print("my-app is free thanks to its sponsors: https://github.com/sponsors/octocat")
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
	sk, err := sponsorkit.New(sponsorkit.Options{
		GitHub:         "octocat",
		OpenCollective: "my-project",
		AppName:        "my-app",
	})
	if err != nil {
		log.Fatal(err)
	}

	fc, _ := sk.GetFinancialContribution(context.Background())
	isSupporter := false
	for _, c := range fc.Active() {
		if c.Amount.Currency == "USD" && c.Amount.Value >= 500 {
			isSupporter = true
		}
	}

	if !isSupporter {
		fmt.Println("my-app is free thanks to its sponsors: https://github.com/sponsors/octocat")
	}
}
```
```rust title="main.rs"
use sponsorkit::{GetOptions, Options, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        opencollective: Some("my-project".into()),
        app_name: Some("my-app".into()),
        ..Default::default()
    })?;

    let fc = sk.get_financial_contribution(GetOptions::default()).await?;
    let is_supporter = fc
        .active()
        .iter()
        .any(|c| c.amount.currency == "USD" && c.amount.value >= 500);

    if !is_supporter {
        println!("my-app is free thanks to its sponsors: https://github.com/sponsors/octocat");
    }
    Ok(())
}
```
:::

A few things make this cheap and safe to call wherever you need it:

- **It's cached.** The result is stored locally and served from the cache for `cacheTtl` (one hour by default),
  so calling it on every page load or every CLI run doesn't hit the network each time. See
  [Caching](../concepts/caching.md).
- **It doesn't throw because of the network.** If Sponsorkit or a provider is down, you get the cached result
  marked `stale`, never an exception. See [Handle errors and offline](errors-and-offline.md).
- **Signed-out users cost nothing.** Without a session there's no network call; the result has `signedIn: false`
  and no contributions, so the rule above shows them the ad.

:::note
Amounts are in **minor units** (`500` is $5.00) and are never converted. A €5 Open Collective contribution is
`{ value: 500, currency: "EUR" }`, so a rule that only checks USD ignores it. Decide which currencies you
accept, or accept any active contribution regardless of amount.
:::

## Let people sign in

Nobody is recognized as a supporter until they sign in through your app. Give them a way to do that, for
example a "Already a sponsor? Sign in" link next to the ad, or a `login` command in a CLI. Sign-in returns the
fresh result, so you can re-apply your rule straight away:

:::tabs
```ts title="sign-in.ts"
import { Sponsorkit, isSponsorkitError } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-project" });
const ad = document.querySelector<HTMLElement>("#ad");

// Call signIn() directly from the click handler so the popup isn't blocked.
document.querySelector("#sign-in")?.addEventListener("click", async () => {
  try {
    const fc = await sk.signIn();
    if (fc.active().length > 0) ad?.setAttribute("hidden", "");
  } catch (e) {
    if (!isSponsorkitError(e, "cancelled")) console.error("Sign-in failed", e);
  }
});
```
```csharp title="Login.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", AppName = "my-app" });

try
{
    var fc = await sk.SignInAsync();
    Console.WriteLine(fc.Active().Count > 0 ? "Thanks for your support!" : "Signed in.");
}
catch (SponsorkitError e) when (e.Code == SponsorkitErrorCodes.Cancelled)
{
    Console.Error.WriteLine("Sign-in cancelled.");
}
```
```python title="login.py"
import sys

from sponsorkit import Sponsorkit, SponsorkitError

sk = Sponsorkit(github="octocat", app_name="my-app")

try:
    fc = sk.sign_in()
    print("Thanks for your support!" if fc.active() else "Signed in.")
except SponsorkitError as e:
    print(f"Sign-in failed: {e.code}", file=sys.stderr)
```
```go title="login.go"
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", AppName: "my-app"})
	if err != nil {
		log.Fatal(err)
	}

	fc, err := sk.SignIn(context.Background())
	if err != nil {
		fmt.Fprintln(os.Stderr, "Sign-in failed:", sponsorkit.ErrorCodeOf(err))
		os.Exit(1)
	}
	if len(fc.Active()) > 0 {
		fmt.Println("Thanks for your support!")
	} else {
		fmt.Println("Signed in.")
	}
}
```
```rust title="login.rs"
use sponsorkit::{Options, SignInOptions, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        app_name: Some("my-app".into()),
        ..Default::default()
    })?;

    match sk.sign_in(SignInOptions::default()).await {
        Ok(fc) if !fc.active().is_empty() => println!("Thanks for your support!"),
        Ok(_) => println!("Signed in."),
        Err(e) => eprintln!("Sign-in failed: {}", e.code().as_str()),
    }
    Ok(())
}
```
:::

How sign-in works on each platform is covered in [Add a sponsor button to a web app](web-app.md) and
[Use Sponsorkit in a CLI or desktop app](native-apps.md).

## Writing your own rule

The helpers only filter; they never add amounts together across providers or currencies. Combine them with
plain code:

| Helper | Keeps |
|---|---|
| `active()` | Contributions with status `active` (running recurring sponsorships). |
| `recurring()` | Monthly and yearly contributions, whatever their status. |
| `oneTime()` | One-time contributions, whatever their status. A completed one has status `paid`. |
| `byProvider(p)` | Contributions on `github` or `opencollective`. |
| `direct()` | Contributions the person made themselves, without those from their organizations. |

Method names follow each language's conventions: `Active()` in .NET and Go, `active()` in Python and Rust,
`one_time()` / `by_provider()` in Python and Rust. Some rules you might write:

- **Any support at all:** `active()` is non-empty, or `oneTime()` has a `paid` contribution. Note that
  `active()` alone excludes one-time contributions, because a completed one-time payment has status `paid`.
- **Only personal sponsorships:** filter `direct()` instead of all contributions. By default, a sponsorship from
  an organization the person belongs to counts too; it's marked `via: "organization"`. See
  [Organizations](../concepts/organizations.md).
- **A tier:** compare `tier.name` (GitHub tiers, when GitHub reports them).
- **Cancelled but still paid up:** check `status: "cancelled"` together with `endedAt`. All statuses are
  explained in [Statuses](../concepts/statuses.md).

:::warning
GitHub sometimes hides the tier of a sponsorship. Sponsorkit then reports `amount: { value: 0, currency: "USD" }`
and `tier: null`. A rule like "at least $5" treats that sponsor as $0, so consider accepting any `active`
contribution if you'd rather not miss them.
:::

## Client-side checks can be patched

Anything checked on the user's own machine can be patched out by a determined user. That's usually fine for
hiding an ad or a nag. If the feature has real cost to you (a hosted service, API quota, downloads), make the
decision on your server instead, with [backend verification](backend-verification.md).
