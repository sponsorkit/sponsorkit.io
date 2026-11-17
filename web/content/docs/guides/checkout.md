---
title: Open checkout and detect a new contribution
description: Send supporters to GitHub Sponsors or Open Collective, then find out when their new contribution appears.
order: 50
---

Sponsorkit never handles money. Supporters pay on GitHub Sponsors or Open Collective, and Sponsorkit can't see
the payment happen. `openCheckout()` bridges that gap: it sends the supporter to the right provider, then checks
their contributions until something new shows up.

## A `sponsor` command

:::tabs
```ts title="sponsor.ts"
import { Sponsorkit, SponsorkitError } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-project", appName: "my-cli" });

try {
  const result = await sk.openCheckout({ frequency: "monthly", amount: 500 });
  if (result.status === "contributed") {
    const { amount } = result.contribution;
    console.log(`Thank you for your ${amount.value / 100} ${amount.currency} contribution!`);
  } else {
    console.log("We couldn't confirm a contribution yet. If you contributed, thank you! It will show up soon.");
  }
} catch (e) {
  // Only before polling starts: from the sign-in phase (cancelled, timeout, access_denied, network_error, ...) or disabled.
  if (!(e instanceof SponsorkitError)) throw e;
  console.error(e.code === "cancelled" || e.code === "timeout" ? "Sign-in was cancelled or timed out." : `Couldn't start checkout: ${e.message}`);
  process.exitCode = 1;
}
```
```csharp title="Sponsor.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "octocat",
    OpenCollective = "my-project",
    AppName = "my-cli",
});

try
{
    var result = await sk.OpenCheckoutAsync(new CheckoutOptions { Frequency = Frequencies.Monthly, Amount = 500 });
    if (result.Status == CheckoutStatus.Contributed && result.Contribution is { } c)
    {
        Console.WriteLine($"Thank you for your {c.Amount.Value / 100m} {c.Amount.Currency} contribution!");
    }
    else
    {
        Console.WriteLine("We couldn't confirm a contribution yet. If you contributed, thank you! It will show up soon.");
    }
}
// Only before polling starts: from the sign-in phase (cancelled, timeout, access_denied, network_error, ...) or disabled.
catch (SponsorkitError e) when (e.Code is SponsorkitErrorCodes.Cancelled or SponsorkitErrorCodes.Timeout)
{
    Console.Error.WriteLine("Sign-in was cancelled or timed out.");
    Environment.ExitCode = 1;
}
catch (SponsorkitError e)
{
    Console.Error.WriteLine($"Couldn't start checkout: {e.Message}");
    Environment.ExitCode = 1;
}
```
```python title="sponsor.py"
import sys

from sponsorkit import Sponsorkit, SponsorkitError

sk = Sponsorkit(github="octocat", opencollective="my-project", app_name="my-cli")

try:
    result = sk.open_checkout(frequency="monthly", amount=500)
except SponsorkitError as e:
    # Only before polling starts: from the sign-in phase (cancelled, timeout, access_denied, network_error, ...)
    # or disabled.
    if e.code in ("cancelled", "timeout"):
        sys.exit("Sign-in was cancelled or timed out.")
    sys.exit(f"Couldn't start checkout: {e}")

if result.status == "contributed" and result.contribution is not None:
    amount = result.contribution.amount
    print(f"Thank you for your {amount.value / 100} {amount.currency} contribution!")
else:
    print("We couldn't confirm a contribution yet. If you contributed, thank you! It will show up soon.")
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
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", OpenCollective: "my-project", AppName: "my-cli"})
	if err != nil {
		log.Fatal(err)
	}

	r, err := sk.OpenCheckout(context.Background(), sponsorkit.CheckoutOptions{
		Frequency: sponsorkit.Monthly,
		Amount:    500,
	})
	if err != nil {
		// Only before polling starts: from the sign-in phase (cancelled, timeout,
		// access_denied, network_error, ...) or disabled.
		if code := sponsorkit.ErrorCodeOf(err); code == sponsorkit.CodeCancelled || code == sponsorkit.CodeTimeout {
			log.Fatal("Sign-in was cancelled or timed out.")
		}
		log.Fatalf("Couldn't start checkout: %v", err)
	}
	if r.Status == sponsorkit.CheckoutContributed {
		a := r.Contribution.Amount
		fmt.Printf("Thank you for your %.2f %s contribution!\n", float64(a.Value)/100, a.Currency)
	} else {
		fmt.Println("We couldn't confirm a contribution yet. If you contributed, thank you! It will show up soon.")
	}
}
```
```rust title="main.rs"
use sponsorkit::{CheckoutOptions, ErrorCode, Frequency, Options, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        opencollective: Some("my-project".into()),
        app_name: Some("my-cli".into()),
        ..Default::default()
    })?;

    let outcome = sk
        .open_checkout(CheckoutOptions {
            frequency: Some(Frequency::Monthly),
            amount: Some(500),
            ..Default::default()
        })
        .await;
    // Only before polling starts: from the sign-in phase (cancelled, timeout,
    // access_denied, network_error, ...) or disabled.
    let outcome = match outcome {
        Ok(outcome) => outcome,
        Err(e) => {
            if matches!(e.code(), ErrorCode::Cancelled | ErrorCode::Timeout) {
                eprintln!("Sign-in was cancelled or timed out.");
            } else {
                eprintln!("Couldn't start checkout: {e}");
            }
            std::process::exit(1);
        }
    };

    match outcome.contribution() {
        Some(c) => println!("Thank you for your {} {} contribution!", c.amount.value as f64 / 100.0, c.amount.currency),
        None => println!("We couldn't confirm a contribution yet. If you contributed, thank you! It will show up soon."),
    }
    Ok(())
}
```
:::

In the browser, call `openCheckout()` from a click handler, because it opens a popup. See
[Add a sponsor button to a web app](web-app.md), or use `<sponsorkit-button>`, which does this for you.

## What happens

1. **Sign in, if needed.** Sponsorkit can only detect a new contribution for someone it knows, so a signed-out
   supporter signs in first (same flows as [sign-in](native-apps.md)). In the browser this happens in the same
   popup; in native apps the browser continues to the checkout page after the loopback sign-in.
2. **Choose a provider.** The checkout page offers the providers that fit the requested amount, currency and
   frequency (rules below). If only one fits, it goes straight there; if both do, the supporter picks.
3. **Pay.** The supporter contributes on GitHub Sponsors or Open Collective.
4. **Detect it.** The SDK re-checks the supporter's contributions every 60 seconds, skipping the cache. In the
   browser it starts once the popup closes; in native apps, right after opening the page. It stops when a
   contribution appears that's new, or changed since the check started (for example a tier upgrade), or when the
   timeout passes.

The 60-second interval isn't arbitrary: the API allows one refresh per minute per session, so polling faster
would only hit the rate limit. Change it with `checkoutPollInterval` (or `pollInterval` per call) if you have a
reason to, for example in tests against a fake server.

## What the result means

| Result | Meaning |
|---|---|
| `{ status: "contributed", contribution }` | A new or changed contribution was found. It's already in the cached result. |
| `{ status: "unknown" }` | Nothing new was found before the timeout, or you cancelled the checkout through your signal or token. |

`unknown` doesn't mean the supporter didn't pay. They may have closed the tab, or the provider may still be
processing the payment. Thank them anyway, and let the next refresh pick it up.

The names follow each language: `CheckoutStatus.Contributed` in .NET, `sponsorkit.CheckoutContributed` in Go,
`CheckoutOutcome::Contributed { contribution }` in Rust (with an `outcome.contribution()` helper).

## Options

| Option | Default | Meaning |
|---|---|---|
| `frequency` | none | `one_time`, `monthly` or `yearly`. |
| `amount` | none | Positive integer in minor units: `500` is $5.00. |
| `currency` | none | ISO 4217 code such as `USD` or `EUR`. Python requires it in uppercase. |
| `provider` | none | `github` or `opencollective`, to preselect a provider. It must be one of your targets. |
| `timeout` | 10 minutes | How long to poll for the new contribution. It starts after sign-in; sign-in has its own `signInTimeout`. |
| `pollInterval` | `checkoutPollInterval` (60 s) | Seconds between checks. |
| cancellation | none | `signal` (JS), `CancellationToken` (.NET, Rust), `cancel` (Python), `ctx` (Go). |

All options are optional. Without any, the supporter picks the provider and the amount on the provider's page.

### Timeouts and cancellation

- Cancelling through your signal or token **resolves** `unknown` in either the sign-in or the polling phase,
  rather than failing.
- If the user closes the sign-in window or enters no code, `openCheckout()` **fails** with `cancelled`, as
  `signIn()` does.
- If the sign-in phase exceeds `signInTimeout`, `openCheckout()` **fails** with `timeout`.
- Other sign-in failures (`access_denied`, `network_error` and so on) fail as they would in `signIn()`.
- In the browser, `openCheckout()` opens its popup first, so it can fail with `popup_blocked` (when no `returnTo` fallback
  is set) even when the supporter is already signed in.
- With `SPONSORKIT_DISABLE` set, `openCheckout()` fails with `disabled`. In [mock mode](mock-mode.md) it resolves
  `contributed` immediately with a simulated contribution.

## Choosing a provider

The checkout page offers a provider only if all of these hold:

- **The account exists** and can receive contributions. On GitHub that means it has a Sponsors listing.
- **The frequency is supported.** GitHub supports `monthly` and `one_time`. Open Collective supports
  `one_time`, `monthly` and `yearly`.
- **The currency matches exactly.** GitHub is always USD. Open Collective uses the collective's currency.
  Sponsorkit never converts currencies.
- **GitHub only: a tier fits.** The listing needs at least one tier for the frequency (monthly when none is
  given). The cheapest tier at or above the amount is preselected, otherwise the highest tier.

If you preselect a provider that doesn't fit while another one does, the page shows the chooser with the reason;
it never switches provider silently. Each disabled option explains why it's unavailable.

On Open Collective, the amount and interval are prefilled on the contribution page, and the supporter returns to a
Sponsorkit "thank you" page afterwards.

## A link instead of a flow

`checkoutUrl()` builds a link to the same checkout page, synchronously and offline, without signing anyone in.
It suits README badges, `--help` output, nag messages and emails:

:::tabs
```ts title="link.ts"
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat" });
console.log(sk.checkoutUrl({ frequency: "monthly", amount: 500 }));
// https://sponsorkit.io/checkout?targets=github%3Aoctocat&amount=500&frequency=monthly
```
```csharp title="Link.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat" });
Console.WriteLine(sk.CheckoutUrl(new CheckoutUrlOptions { Frequency = Frequencies.Monthly, Amount = 500 }));
```
```python title="link.py"
from sponsorkit import Sponsorkit

sk = Sponsorkit(github="octocat")
print(sk.checkout_url(frequency="monthly", amount=500))
```
```go title="main.go"
package main

import (
	"fmt"
	"log"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat"})
	if err != nil {
		log.Fatal(err)
	}
	url, err := sk.CheckoutURL(sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly, Amount: 500})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(url)
}
```
```rust title="main.rs"
use sponsorkit::{CheckoutOptions, Frequency, Options, Sponsorkit};

fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options { github: Some("octocat".into()), ..Default::default() })?;
    let url = sk.checkout_url(&CheckoutOptions {
        frequency: Some(Frequency::Monthly),
        amount: Some(500),
        ..Default::default()
    })?;
    println!("{url}");
    Ok(())
}
```
:::

Invalid options (an unconfigured provider, an unknown frequency, a non-positive amount, a malformed currency)
fail with `invalid_config`. A contribution made through this link isn't detected right away, because nobody is
waiting for it; it shows up the next time the supporter is signed in and the cache refreshes.
