---
title: Reading contributions in .NET
description: GetFinancialContributionAsync, the ContributionResult it returns, the filter helpers, and how caching and staleness work.
sidebar_label: Contributions
order: 30
---

`GetFinancialContributionAsync` answers "what has the current user contributed to my targets?". It's safe to call
on every start of your app:

- **Signed out:** it returns `SignedIn == false` right away, with no request.
- **Signed in:** it serves the local cache while it's younger than `CacheTtl` (1 hour by default), and otherwise
  asks Sponsorkit.
- **Offline, failing or rate limited:** it returns the cached result marked `Stale`, or an empty signed-in result
  if nothing is cached. It never throws for network or server problems.

The only exceptions it can throw are `OperationCanceledException` when you cancel its token, and
`SponsorkitError("invalid_config")` from the opt-in [dev-time target check](configuration.md#the-dev-time-target-check).

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", OpenCollective = "my-collective" });

var fc = await sk.GetFinancialContributionAsync();
foreach (var c in fc.Contributions)
{
    Console.WriteLine($"{c.Provider} {c.Kind} {c.Status}: {c.Amount.Value / 100.0:0.00} {c.Amount.Currency} ({c.Frequency})");
}
```

## The result

`ContributionResult` reports facts per provider. Sponsorkit never sums amounts or converts currencies, because a
monthly $5 on GitHub and a yearly €50 on Open Collective only mean something under your own rules.

| Property | Type | Meaning |
|---|---|---|
| `SignedIn` | `bool` | Whether a supporter is signed in. |
| `Disabled` | `bool` | `SPONSORKIT_DISABLE` is set; everything else is empty. |
| `Mock` | `bool` | The data comes from [mock mode](testing.md). |
| `Targets` | `IReadOnlyList<string>` | Your canonical targets, for example `github:octocat`. |
| `Supporter` | `Supporter?` | `Id` (`sup_…`, stable per person and target set) and `Identities`. `null` when signed out, or signed in with nothing fetched yet. |
| `Contributions` | `IReadOnlyList<Contribution>` | Every contribution to your targets, as reported. |
| `FetchedAt` | `DateTimeOffset?` | When the data was fetched from the providers. |
| `Stale` | `bool` | Some or all of the data couldn't be refreshed. |
| `FromCache` | `bool` | The whole result came from the local cache. |
| `Unavailable` | `IReadOnlyList<string>?` | Providers the API couldn't query this time; their contributions come from the cache. |

Each `Contribution` has:

| Property | Meaning |
|---|---|
| `Id` | Stable id, derived from the provider and its own id. |
| `Provider`, `Target` | `github` or `opencollective`, and the target it was made to (`github:octocat`). |
| `Sponsor` | Who pays: `Type` (`user` or `organization`), `Provider`, `Id`, `Handle`. |
| `Via` | `direct`, or `organization` when an organization the supporter belongs to pays. |
| `Kind` | `recurring` or `one_time` (`ContributionKinds`). |
| `Frequency` | `monthly`, `yearly` or `one_time` (`Frequencies`). |
| `Status` | `active`, `paused`, `cancelled`, `paid`, `refunded`, `disputed`, `failed` or `pending` (`ContributionStatuses`). `IsActive` is `Status == "active"`. |
| `Amount` | A `Money`: `Value` in minor units (500 is $5.00) and an uppercase ISO 4217 `Currency`. |
| `Tier` | The provider tier (`Id`, `Name`), when there is one. |
| `Flags` | Extra facts, such as `via_patreon`. |
| `IsPrivate` | The supporter marked the contribution private. |
| `StartedAt`, `EndedAt` | When it started and ended. |
| `LastChargedAt`, `NextChargeAt`, `TotalContributed` | Open Collective only. |

The string values are exposed as constants in [`Providers`](/docs/reference/dotnet/providers),
[`Frequencies`](/docs/reference/dotnet/frequencies), [`ContributionKinds`](/docs/reference/dotnet/contributionkinds)
and [`ContributionStatuses`](/docs/reference/dotnet/contributionstatuses). [Statuses](../../concepts/statuses.md)
explains how each provider's states map to them, and [contribution shape](../../concepts/contributions.md) shows
the same fields in every language.

## Helpers

The helpers filter `Contributions` and return a new list. None of them aggregates.

| Helper | Returns |
|---|---|
| `Active()` | Contributions with status `active`. |
| `Recurring()` | `Kind == "recurring"`, any status. |
| `OneTime()` | `Kind == "one_time"`, any status. |
| `ByProvider(provider)` | Contributions made through `github` or `opencollective`. |
| `Direct()` | Contributions the supporter pays personally, excluding [organization sponsorships](../../concepts/organizations.md). |

Write your rule with them and LINQ. For example, "an active sponsorship of at least $5 a month, paid personally,
or any one-time contribution in the last year":

```csharp title="Supporter.cs"
using System;
using System.Linq;
using Sponsorkit;

public static class Supporter
{
    public static bool Unlocks(ContributionResult fc, DateTimeOffset now) =>
        fc.Active().Any(c => c.Via == "direct" && c.Frequency == Frequencies.Monthly
                             && c.Amount.Currency == "USD" && c.Amount.Value >= 500)
        || fc.OneTime().Any(c => c.Status == ContributionStatuses.Paid
                                 && c.StartedAt is { } started && now - started < TimeSpan.FromDays(365));
}
```

Keep the rule in one pure function like this, so you can [unit-test it](testing.md#unit-testing-your-rule) with
mock data. [Gate a feature](../../guides/gate-features.md) has more examples of rules.

## Caching and freshness

The cache lives in the same state file as the session token, one per target set (see
[where state is kept](platform-notes.md#where-state-is-kept)).

- **`CacheTtl`** (default 1 hour, minimum 60 seconds) sets how long a stored result is served without a
  request.
- **Per call**, `GetFinancialContributionAsync(TimeSpan cacheTtl, ...)` takes any TTL of zero or more.
  `TimeSpan.Zero` always asks the API. Use it right after something you know changed, for example when the user
  says they just contributed:

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat" });

// Normal start: cheap, served from the cache most of the time.
var fc = await sk.GetFinancialContributionAsync();

// "I just sponsored, refresh!" button: skip the cache.
if (args.Contains("--refresh")) fc = await sk.GetFinancialContributionAsync(TimeSpan.Zero);

if (fc.Stale)
    Console.Error.WriteLine($"Showing data from {fc.FetchedAt:u}; Sponsorkit couldn't be reached.");
```

What the flags mean:

| `FromCache` | `Stale` | Situation |
|---|---|---|
| `false` | `false` | Fresh from Sponsorkit. |
| `true` | `false` | Served from the cache within the TTL. |
| `true` | `true` | Sponsorkit was unreachable, failing or rate limited; this is the last good result. |
| `false` | `true` | Fresh, but a provider is `Unavailable`; its contributions are merged from the cache. Or signed in with nothing cached yet, so `Contributions` is empty. |

When Sponsorkit answers `429`, the SDK honours `Retry-After` (60 seconds when the header is missing): calls in
the same process serve the cache until then, even with `TimeSpan.Zero`. A `401` means the session is no longer
valid; the SDK deletes it and the cache and returns the signed-out result. More in
[caching & freshness](../../concepts/caching.md).

## Sending the result elsewhere

`ContributionResult` serializes with `System.Text.Json` to the same JSON shape as the protocol and every other
SDK (`signedIn`, `contributions`, `fetchedAt` and so on), which is handy for logs or for passing it to a web view:

```csharp title="Program.cs"
using System.Text.Json;
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", Mock = "active-monthly" });
var fc = await sk.GetFinancialContributionAsync();
Console.WriteLine(JsonSerializer.Serialize(fc, new JsonSerializerOptions { WriteIndented = true }));
```

This is not a way to prove anything to a server: anyone can edit JSON. Servers verify the session token instead;
see [backend verification](backend-verification.md).
