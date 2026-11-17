---
title: Nag in .NET
description: Ask for support every N runs or every N days with SponsorkitNag, never in CI or scripts, and never someone who already contributes.
sidebar_label: Nag
order: 50
---

A nag is a gentle "Enjoying this? Consider supporting it" message. `sk.Nag(...)` gives you a `SponsorkitNag` that
remembers how often your app ran and when the message was last shown. It decides *when*; you decide *what* to
print and *who* should see it. Sponsorkit never prints anything itself and never signs anyone in from a nag.

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", AppName = "my-cli" });

var nag = sk.Nag(new NagOptions("my-cli") { Every = 10, OrEvery = TimeSpan.FromDays(7) });
if (await nag.DueAsync(fc => fc.Active().Count == 0))
{
    Console.Error.WriteLine($"Enjoying my-cli? Support it: {sk.CheckoutUrl(new CheckoutUrlOptions { Frequency = Frequencies.Monthly })}");
    nag.Shown();
}
```

Print to stderr, as above, so the message never ends up in output that another program parses.

## Options

| `NagOptions` | Default | Meaning |
|---|---|---|
| `Id` (constructor) | required | A stable name, such as your app's name. Counters are kept per id, so one app can have several nags. An empty id throws `ArgumentException`. |
| `Every` | `10` | Due once the app has run this many times since the nag was last shown. |
| `OrEvery` | `null` | Also due once this much time has passed since it was last shown. Never before the first `Shown()`. |

`NagOptions.ParseDuration("P7D")` turns an ISO-8601 duration (`P7D`, `PT12H`) into a `TimeSpan`, for
durations read from a config file. Invalid input throws `invalid_config`.

## How `DueAsync` decides

`DueAsync(predicate, force = false, cancellationToken = default)`:

1. Returns `false` if `SPONSORKIT_DISABLE` is set.
2. **Counts this run**, once per process per id, even if it later returns `false`. Calling `DueAsync` twice in
   one process counts one run.
3. Returns `false` if `SPONSORKIT_NO_NAG` or `CI` is set, or if stdout or stderr is redirected, unless `force` is
   `true`.
4. Calls `GetFinancialContributionAsync` (served from the cache when fresh) and passes the result to your
   predicate. Returns `false` if the predicate does.
5. Returns `true` if `runs >= Every`, or if `OrEvery` is set and at least `OrEvery` has passed since the last
   `Shown()`.

`Shown()` resets the run counter and the timer. Call it only when you actually displayed the message.

The counters live in the state file next to the session, so they survive restarts and `SignOutAsync`. They're
kept per target set, not per user account on your side.

## Choosing the predicate

The predicate is your policy. A few common ones:

```csharp title="Predicates.cs"
using System.Linq;
using Sponsorkit;

public static class Predicates
{
    // Everyone without an active contribution, including signed-out users.
    public static bool NotActive(ContributionResult fc) => fc.Active().Count == 0;

    // Only signed-in users who have never contributed: don't pester anonymous users.
    public static bool SignedInNeverContributed(ContributionResult fc) => fc.SignedIn && fc.Contributions.Count == 0;

    // Lapsed supporters: they had a recurring contribution that's no longer active.
    public static bool Lapsed(ContributionResult fc) =>
        fc.Active().Count == 0 && fc.Recurring().Any(c => c.Status == ContributionStatuses.Cancelled);
}
```

Use them as `await nag.DueAsync(Predicates.Lapsed)`. Because a signed-out result has no contributions, a
predicate like `NotActive` also nags signed-out users; pair the message with a hint such as "Already a supporter?
Run `my-cli login`."

## Terminals, CI and GUIs

The terminal check exists so that a nag never lands in a log file or a pipe. Two options change it:

- `SponsorkitOptions.Interactive = true` treats the process as interactive regardless of redirection. Use it in
  GUI apps, where stdout is often redirected or absent but the user sees your dialog, not the console.
- `DueAsync(predicate, force: true)` skips the terminal, `CI` and `SPONSORKIT_NO_NAG` checks for one call, for
  example from an explicit `my-cli about` command. `SPONSORKIT_DISABLE` still wins.

```csharp title="Program.cs"
using Sponsorkit;

// A desktop app: the nag is a dialog, so stdout redirection doesn't matter.
var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", AppName = "My App", Interactive = true });

var nag = sk.Nag(new NagOptions("my-app-dialog") { Every = 20, OrEvery = NagOptions.ParseDuration("P30D") });
if (await nag.DueAsync(fc => fc.Active().Count == 0))
{
    // ShowSupportDialog(sk.CheckoutUrl());
    nag.Shown();
}
```

To test a nag without running your app ten times, see [testing nags](testing.md#testing-nags). The
[nag guide](../../guides/nag.md) has the same patterns in every language.
