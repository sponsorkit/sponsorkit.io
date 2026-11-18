---
title: Checkout in Go
description: Send users to contribute with OpenCheckout, which signs in, opens the browser and waits for the contribution, or with an offline CheckoutURL link.
sidebar_label: Checkout
order: 40
---

There are two ways to send someone to contribute:

| | `OpenCheckout(ctx, opts)` | `CheckoutURL(opts)` |
|---|---|---|
| What it does | Signs in if needed, opens the checkout page, waits for the new contribution | Returns a link |
| Detects the contribution | Yes | No |
| Network, disk, browser | Yes | None: synchronous and offline |
| Good for | A `sponsor` command or button | Nag messages, `--help` output, READMEs |

Both take a `sponsorkit.CheckoutOptions`.

## OpenCheckout

```go title="main.go"
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", OpenCollective: "my-collective", AppName: "my-cli"})
	if err != nil {
		log.Fatal(err)
	}
	r, err := sk.OpenCheckout(ctx, sponsorkit.CheckoutOptions{
		Provider:  sponsorkit.GitHub,
		Amount:    500, // minor units: $5.00
		Frequency: sponsorkit.Monthly,
		Timeout:   15 * time.Minute,
	})
	if err != nil {
		log.Fatal(err) // disabled, invalid_config, or a sign-in error
	}
	if r.Status == sponsorkit.CheckoutContributed {
		c := r.Contribution
		fmt.Printf("Thank you! %d %s, %s\n", c.Amount.Value, c.Amount.Currency, c.Status)
	} else {
		fmt.Println("No new contribution yet. It can take a moment to show up; try `my-cli status` later.")
	}
}
```

What happens, step by step:

1. **Sign-in, when needed.** If no session is stored, the checkout page itself signs the user in, with the same
   loopback or paste-back flow as [`SignIn`](sign-in.md#choosing-a-flow). This phase is bounded by
   `Options.SignInTimeout` and fails with the usual [sign-in errors](sign-in.md#errors). Signing in first is what
   lets the SDK detect the new contribution.
2. **The checkout page.** When already signed in, the SDK takes the current result as a baseline and opens the
   checkout page with `OpenBrowser`. If the browser can't be opened, it prints the URL to `Options.Stderr`.
3. **Polling.** The SDK then refreshes with a zero cache TTL, immediately and then every `PollInterval`
   (`Options.CheckoutPollInterval`, 60 seconds by default), until a contribution appears that is new or changed
   compared with the baseline. `Timeout` (10 minutes by default) bounds only this phase.

## The result

`*sponsorkit.CheckoutResult` has a `Status`:

- `sponsorkit.CheckoutContributed`: a new or changed contribution was found, and `Contribution` points to it.
  Thank the user; the next `GetFinancialContribution` includes it.
- `sponsorkit.CheckoutUnknown`: nothing was detected before the polling timeout, or `ctx` was cancelled.
  `Contribution` is nil. The supporter may still have paid (payments can take a while to show up), so don't
  treat this as "declined".

Cancelling `ctx` resolves with `CheckoutUnknown` and no error, in either phase. That makes Ctrl+C during a
checkout a normal outcome rather than a failure.

## Options

| Field | Default | Meaning |
|---|---|---|
| `Provider` | none (the page offers your targets) | Preselect `sponsorkit.GitHub` or `sponsorkit.OpenCollective`. The page never silently switches to another provider. Must be one of your targets. |
| `Amount` | unset | Suggested amount in minor units (`500` is $5.00). `0` means unset; negative is invalid. |
| `Currency` | unset | An ISO 4217 code, uppercased for you. GitHub is always USD. |
| `Frequency` | unset | `sponsorkit.OneTime`, `sponsorkit.Monthly` or `sponsorkit.Yearly`. |
| `Timeout` | 10 minutes | `OpenCheckout` only: how long to poll after the page opens. |
| `PollInterval` | `Options.CheckoutPollInterval` | `OpenCheckout` only: how often to poll. |
| `SignInMethod` | `Options.SignInMethod` | `OpenCheckout` only: the flow to use if the user must sign in first. |

A provider that isn't one of your targets, a negative amount, a currency that isn't three letters, or an unknown
frequency is `invalid_config`, from both `OpenCheckout` and `CheckoutURL`. The other errors from `OpenCheckout`
are `disabled` (with `SPONSORKIT_DISABLE`) and the sign-in errors when a sign-in was needed and failed. The
[checkout guide](../../guides/checkout.md#choosing-a-provider) helps you choose a provider.

## CheckoutURL

`CheckoutURL` builds the same page's URL without signing in. It never touches the network or the disk, so it is
cheap enough to call while printing a message:

```go title="main.go"
package main

import (
	"fmt"
	"log"
	"os"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat"})
	if err != nil {
		log.Fatal(err)
	}
	link, err := sk.CheckoutURL(sponsorkit.CheckoutOptions{Frequency: sponsorkit.Monthly, Amount: 500})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Fprintln(os.Stderr, "Support my-cli:", link)
	// https://sponsorkit.github.io/sponsorkit.io/checkout/?amount=500&frequency=monthly&targets=github%3Aoctocat
}
```

A contribution started from that link can't be detected as it happens, but it shows up in
`GetFinancialContribution` once the user signs in (or when the cache next refreshes, if they already are).

## In mock mode

`OpenCheckout` resolves immediately with `CheckoutContributed` and a simulated contribution built from your
options: $5.00 USD monthly by default, `paid` instead of `active` for `OneTime`. The client becomes signed in and
the contribution is added to later results. See [Testing](testing.md).
