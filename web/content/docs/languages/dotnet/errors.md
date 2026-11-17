---
title: Errors and cancellation in .NET
description: The SponsorkitError exception and its codes, which methods throw what, and how each method reacts to a cancelled CancellationToken.
sidebar_label: Errors & cancellation
order: 80
---

The .NET SDK follows the [error contract](../../concepts/error-contract.md) every Sponsorkit SDK shares:

- **Reading never breaks your app.** `GetFinancialContributionAsync` doesn't throw for network errors, outages,
  5xx responses or rate limits. It reports them through `Stale` (see [contributions](contributions.md#caching-and-freshness)).
- **Configuration mistakes fail fast**, in the constructor or at the call with the bad options.
- **Actions the user asked for** (sign-in, checkout) throw when they can't complete, so you can tell the user why.

## `SponsorkitError`

Every exception the SDK throws on purpose is a `SponsorkitError`, a sealed subclass of `Exception`. Branch on its
`Code`, a stable string, not on the message, which is for humans and may change.

| Member | Meaning |
|---|---|
| `Code` | One of the `SponsorkitErrorCodes` constants below. |
| `Message` | A readable description, fine to show or log. |
| `RetryAfter` | `TimeSpan?`. For `network_error` caused by a rate limit: how long Sponsorkit asked you to wait. Invalid values are ignored and long ones are capped at 24 hours. |
| `InnerException` | The underlying exception, such as an `HttpRequestException`, when there is one. |

C# exception filters keep the handling tidy:

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", AppName = "my-cli" });

try
{
    await sk.SignInAsync();
}
catch (SponsorkitError e) when (e.Code is SponsorkitErrorCodes.Cancelled or SponsorkitErrorCodes.Timeout)
{
    Console.Error.WriteLine("Sign-in didn't finish. Run `my-cli login` to try again.");
}
catch (SponsorkitError e) when (e.Code == SponsorkitErrorCodes.NetworkError)
{
    var hint = e.RetryAfter is { } wait ? $" Try again in {Math.Ceiling(wait.TotalMinutes)} minute(s)." : "";
    Console.Error.WriteLine($"Could not reach Sponsorkit.{hint}");
}
catch (SponsorkitError e)
{
    Console.Error.WriteLine($"Sign-in failed ({e.Code}): {e.Message}");
}
```

## Error codes

| Code (`SponsorkitErrorCodes.…`) | Thrown by | When |
|---|---|---|
| `invalid_config` (`InvalidConfig`) | constructor, `CheckoutUrl`, `OpenCheckoutAsync`, `SignInAsync`, `SignOutAsync`, `NagOptions.ParseDuration`, `VerifySessionAsync` | Bad configuration or options; a provider that isn't one of your targets; a target that doesn't exist (dev-time check only); the state file couldn't be written while signing in or out. |
| `disabled` (`Disabled`) | `SignInAsync`, `OpenCheckoutAsync` | `SPONSORKIT_DISABLE` is set. |
| `access_denied` (`AccessDenied`) | `SignInAsync`, `OpenCheckoutAsync` | The user declined at GitHub or Open Collective. |
| `invalid_state` (`InvalidState`) | `SignInAsync`, `OpenCheckoutAsync` | The sign-in state expired or couldn't be verified. |
| `provider_error` (`ProviderError`) | `SignInAsync`, `OpenCheckoutAsync` | The provider failed during sign-in. |
| `invalid_code` (`InvalidCode`) | `SignInAsync`, `OpenCheckoutAsync` | Sponsorkit rejected the code exchange, for example a mistyped or expired paste-back code. |
| `cancelled` (`Cancelled`) | `SignInAsync`, `OpenCheckoutAsync` | The sign-in's token was cancelled, or no paste-back code was entered. |
| `timeout` (`Timeout`) | `SignInAsync`, `OpenCheckoutAsync` | The sign-in didn't finish within `SignInTimeout` (5 minutes by default). |
| `network_error` (`NetworkError`) | `SignInAsync`, `OpenCheckoutAsync`, `VerifySessionAsync` | Sponsorkit was unreachable, timed out (`RequestTimeout`), or answered 5xx, 429, a 400 other than `invalid_code`, or something unexpected. A forced `Loopback` sign-in that can't listen on `127.0.0.1` also throws it. |
| `session_invalid` (`SessionInvalid`) | `VerifySessionAsync` | The token is malformed, expired or rejected. |
| `targets_mismatch` (`TargetsMismatch`) | `VerifySessionAsync` | The token was issued for different targets. |
| `popup_blocked` (`PopupBlocked`) | never | Browser-only; the constant exists for parity with the other SDKs. |

`OpenCheckoutAsync` throws the sign-in codes only while it signs a signed-out user in. Each constant is
documented in the [`SponsorkitErrorCodes` reference](/docs/reference/dotnet/sponsorkiterrorcodes).

Besides `SponsorkitError`, you'll only see the standard argument checks (`ArgumentNullException` for a `null`
options object or predicate, `ArgumentException` for an empty nag id) and `OperationCanceledException` from
cancellation, below.

## Cancellation

Every async method takes an optional `CancellationToken` as its last parameter. What cancelling does depends on
what the method is for:

| Method | When the token is cancelled |
|---|---|
| `GetFinancialContributionAsync` | Throws `OperationCanceledException`, the usual .NET behaviour. |
| `SponsorkitNag.DueAsync` | Throws `OperationCanceledException` (from the contribution lookup). The run is already counted. |
| `SponsorkitServer.VerifySessionAsync` | Throws `OperationCanceledException`. |
| `SignInAsync` | Throws `SponsorkitError` with code `cancelled`, so one `catch` handles "the user gave up" alongside other sign-in failures. |
| `OpenCheckoutAsync` | Never throws for cancellation. Returns `CheckoutStatus.Unknown`, in the sign-in phase and in the polling phase alike. |
| `SignOutAsync` | Throws `OperationCanceledException` only if the token is already cancelled when you call it; the call is otherwise synchronous. |

Time limits work the same way. `SignInTimeout` makes a sign-in throw `timeout`, `CheckoutOptions.Timeout` makes
checkout polling return `Unknown`, and `RequestTimeout` turns a slow request into a network error, which
`GetFinancialContributionAsync` absorbs. To bound a whole call yourself, use a `CancellationTokenSource` with a
delay:

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat" });

// Don't let the startup check hold up the app for more than two seconds.
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
ContributionResult? fc = null;
try
{
    fc = await sk.GetFinancialContributionAsync(cts.Token);
}
catch (OperationCanceledException)
{
    // Carry on without it; the next start will most likely be served from the cache.
}
Console.WriteLine(fc?.SignedIn == true ? $"{fc.Active().Count} active contribution(s)" : "No answer yet");
```

## Turning the SDK off

With `SPONSORKIT_DISABLE` set, nothing touches the network or the disk: `GetFinancialContributionAsync` returns
`Disabled == true` with no contributions, `DueAsync` returns `false`, `SignOutAsync` does nothing,
`CheckoutUrl` still builds links, and `SignInAsync` and `OpenCheckoutAsync` throw `disabled`. Handle `disabled`
wherever you call those two, for example by printing the checkout link instead. [Handle errors and
offline](../../guides/errors-and-offline.md) covers these situations across languages.
