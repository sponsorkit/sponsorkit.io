---
title: Checkout in .NET
description: Send users to contribute with CheckoutUrl for links and OpenCheckoutAsync to open the checkout and wait for the new contribution.
sidebar_label: Checkout
order: 40
---

There are two ways to send someone to contribute:

| | `CheckoutUrl(options)` | `OpenCheckoutAsync(options, ct)` |
|---|---|---|
| Returns | A `string` URL | A `Task<CheckoutResult>` |
| Signs in | No | Yes, first, if the user isn't signed in |
| Network or browser | None: synchronous and offline | Opens the browser, then polls Sponsorkit |
| Use it for | Nags, `--help` text, READMEs, "Sponsor" links in a UI | A `sponsor` command or button that should thank the user when they're done |

Both send the user to Sponsorkit's checkout page, which forwards them to GitHub Sponsors or Open Collective.
Payment always happens on the provider's own site; Sponsorkit never handles money.

## Options

`CheckoutUrlOptions` holds the preferences; `CheckoutOptions` extends it with the polling settings.

| Property | Type | Default | Meaning |
|---|---|---|---|
| `Provider` | `string?` | the page asks | `github` or `opencollective`. Must be one of your targets. |
| `Amount` | `long?` | none | Suggested amount in minor units (500 is $5.00). Must be positive. |
| `Currency` | `string?` | none | Three-letter ISO 4217 code such as `USD`. The checkout URL uppercases it; in mock mode the simulated contribution keeps it as you passed it. |
| `Frequency` | `string?` | none | `one_time`, `monthly` or `yearly`, from `Frequencies`. |
| `Timeout` | `TimeSpan?` | 10 minutes | `CheckoutOptions` only: how long to poll for the new contribution. |
| `PollInterval` | `TimeSpan?` | `CheckoutPollInterval` (60 s) | `CheckoutOptions` only: time between polls. |
| `SignInMethod` | `SignInMethod?` | the client's | `CheckoutOptions` only: how to sign in if needed. |

Invalid values (an unknown or unconfigured provider, a frequency other than the three above, an amount of zero or
less, or a currency that isn't three letters) throw `SponsorkitError("invalid_config")` before anything
happens. Amounts and frequencies are suggestions: the provider's page decides what's possible, and
[checkout](../../guides/checkout.md) describes how each provider treats them.

## A link: `CheckoutUrl`

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", OpenCollective = "my-collective" });

Console.WriteLine(sk.CheckoutUrl());
// https://sponsorkit.github.io/sponsorkit.io/checkout/?targets=github%3Aoctocat%2Copencollective%3Amy-collective

Console.WriteLine(sk.CheckoutUrl(new CheckoutUrlOptions
{
    Provider = Providers.OpenCollective,
    Amount = 1000,
    Currency = "EUR",
    Frequency = Frequencies.Yearly,
}));
```

`CheckoutUrl` needs no sign-in and makes no request, so it's safe anywhere, even with `SPONSORKIT_DISABLE` set
(the link still points at your checkout page).

## Open and wait: `OpenCheckoutAsync`

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", AppName = "my-cli" });

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

try
{
    var result = await sk.OpenCheckoutAsync(
        new CheckoutOptions { Frequency = Frequencies.Monthly, Amount = 500, Timeout = TimeSpan.FromMinutes(15) },
        cts.Token);

    if (result.Status == CheckoutStatus.Contributed)
        Console.WriteLine($"Thank you for your {result.Contribution!.Frequency} contribution!");
    else
        Console.WriteLine("No new contribution yet. If you completed the payment, it will show up shortly.");
}
catch (SponsorkitError e)
{
    Console.Error.WriteLine($"Could not open the checkout ({e.Code}): {e.Message}");
}
```

What happens, step by step:

1. **Signed out:** the checkout page asks the user to sign in first and then continues to the payment, in one
   flow, using the client's sign-in method (or `CheckoutOptions.SignInMethod`). The sign-in phase is bounded by `SignInTimeout` and throws
   its usual errors, such as `timeout` or `access_denied`.
2. **Signed in:** the SDK records the current contributions and opens the checkout page. If the browser can't be
   opened, it prints the URL to stderr instead.
3. **Polling:** every `PollInterval` it fetches the contributions, skipping the cache, until one is new or has
   changed (for example a cancelled sponsorship that became active again), then returns
   `CheckoutStatus.Contributed` with that contribution.

The result is `CheckoutStatus.Unknown` with `Contribution == null` when `Timeout` runs out, when the token is
cancelled in either phase, or when the session stops being valid while polling. `Unknown` doesn't mean the user
didn't pay: providers sometimes take a few minutes to report a new contribution. The next
`GetFinancialContributionAsync` after the cache expires will pick it up.

`OpenCheckoutAsync` throws `disabled` when `SPONSORKIT_DISABLE` is set, `invalid_config` for bad options, and
the sign-in errors from step 1. Cancelling never throws; see [errors & cancellation](errors.md#cancellation).

## In mock mode

With `Mock` or `SPONSORKIT_MOCK` set, `OpenCheckoutAsync` returns `Contributed` immediately with a simulated
contribution built from your options (amount 500 USD and monthly unless you say otherwise; `Currency` is kept exactly as you pass it, not uppercased), signs the instance in
and adds the contribution to later results. See [testing](testing.md).
