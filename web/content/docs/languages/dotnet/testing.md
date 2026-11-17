---
title: Testing with .NET
description: Test your rules with mock presets and custom contributions, control time, environment and storage in tests, and keep CI quiet.
sidebar_label: Testing
order: 60
---

Three tools cover almost every test:

- **Mock mode** returns fixed results with no network and no disk access. Use it for your rules and your UI.
- **Test hooks** on `SponsorkitOptions` (`Environment`, `Clock`, `StorageDirectory`, `Interactive`) and
  `SponsorkitClient.ResetProcessState()` make the real code paths deterministic.
- **`SPONSORKIT_DISABLE`** switches the SDK off entirely, for CI and for users who don't want it.

The examples use xUnit; nothing in the SDK depends on a test framework.

## Mock mode

Set `Mock` to a preset name (a `string` converts implicitly) or to custom contributions:

```csharp title="Program.cs"
using Sponsorkit;

var preset = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", Mock = "active-monthly" });
var custom = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "octocat",
    Mock = SponsorkitMock.WithContributions(new[]
    {
        new Contribution
        {
            Id = "con_test_1",
            Provider = Providers.GitHub,
            Target = "github:octocat",
            Via = "direct",
            Kind = ContributionKinds.Recurring,
            Frequency = Frequencies.Monthly,
            Status = ContributionStatuses.Active,
            Amount = new Money { Value = 2500, Currency = "USD" },
        },
    }),
});

Console.WriteLine((await preset.GetFinancialContributionAsync()).Active().Count); // 1
Console.WriteLine((await custom.GetFinancialContributionAsync()).Active()[0].Amount.Value); // 2500
```

Or select a preset without changing code, from the environment:

```bash title="Terminal"
SPONSORKIT_MOCK=one-time dotnet run
```

The `Mock` option wins over `SPONSORKIT_MOCK`, and `SPONSORKIT_DISABLE` wins over both. An unknown preset name
makes the constructor throw `invalid_config`. `SponsorkitMock.PresetNames` lists the valid names.

### Presets

Every preset uses your first target (in canonical order) as the provider and target, and a supporter with id
`sup_mock` and handle `mock-user`.

| Preset | Signed in | Contributions |
|---|---|---|
| `signed-out` | No | none |
| `none` | Yes | none |
| `active-monthly` | Yes | $5.00 monthly, `active`, direct |
| `one-time` | Yes | $25.00 one-time, `paid`, direct |
| `cancelled` | Yes | $5.00 monthly, `cancelled`, direct |
| `org` | Yes | $10.00 monthly, `active`, paid by an organization (`Via == "organization"`) |

### What mock mode does

- Results have `Mock == true`, `FetchedAt == null`, `Stale == false` and `FromCache == false`.
- Nothing touches the network or the disk; state lives in memory, per client instance.
- `SignInAsync` returns at once and signs the instance in. If it was signed out, its contributions become empty.
- `SignOutAsync` returns at once; later results are signed out.
- `OpenCheckoutAsync` returns `Contributed` at once with a simulated contribution built from your options
  (500 USD monthly by default), and adds it to later results. The currency is kept as you pass it, so pass
  `"EUR"`, not `"eur"`, if your rule compares against uppercase codes.
- `IsSignedIn()` follows the mock state: `false` for `signed-out` and after `SignOutAsync`, `true` otherwise.
- Nag state lives in memory too, so a nag can't carry run counts from one instance to the next. Test nags as
  shown [below](#testing-nags).

## Unit-testing your rule

Keep the decision ("does this user get the feature?") in a function of `ContributionResult`, and test it with
mock clients:

```csharp title="SupporterRuleTests.cs"
using System.Linq;
using System.Threading.Tasks;
using Sponsorkit;
using Xunit;

public static class SupporterRule
{
    public static bool Unlocks(ContributionResult fc) =>
        fc.Active().Any(c => c.Amount.Currency == "USD" && c.Amount.Value >= 500);
}

public class SupporterRuleTests
{
    private static Task<ContributionResult> Mocked(SponsorkitMock mock) =>
        new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", Mock = mock }).GetFinancialContributionAsync();

    [Theory]
    [InlineData("active-monthly", true)]
    [InlineData("org", true)]
    [InlineData("cancelled", false)]
    [InlineData("one-time", false)]
    [InlineData("none", false)]
    [InlineData("signed-out", false)]
    public async Task Presets(string preset, bool expected) =>
        Assert.Equal(expected, SupporterRule.Unlocks(await Mocked(preset)));

    [Fact]
    public async Task SmallSponsorshipsDoNotUnlock()
    {
        var fc = await Mocked(SponsorkitMock.WithContributions(new[]
        {
            new Contribution { Id = "con_small", Provider = Providers.GitHub, Status = ContributionStatuses.Active,
                               Amount = new Money { Value = 100, Currency = "USD" } },
        }));
        Assert.False(SupporterRule.Unlocks(fc));
    }

    [Fact]
    public async Task CheckoutUnlocks()
    {
        var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", Mock = "none" });
        var result = await sk.OpenCheckoutAsync(new CheckoutOptions { Amount = 1000, Currency = "USD" });

        Assert.Equal(CheckoutStatus.Contributed, result.Status);
        Assert.True(SupporterRule.Unlocks(await sk.GetFinancialContributionAsync()));
    }
}
```

A `Contribution` you build yourself is returned exactly as given, so set the fields your rule reads.

## Test hooks

| Hook | Use it to |
|---|---|
| `Environment` | Give the instance its own environment: `new Dictionary<string, string>()` means "nothing set", regardless of the machine running the tests. |
| `StorageDirectory` | Keep state in a temporary folder instead of the user's config folder. |
| `Storage` | Plug in an `ISponsorkitStorage` of your own, for example an in-memory one. |
| `Clock` | Control "now" for cache expiry and `OrEvery`. |
| `Interactive` | Make the nag's terminal check pass (or fail) under a test runner, which redirects output. |
| `ApiBaseUrl`, `HttpClient` | Point the SDK at a fake server. |
| `OpenBrowser`, `PromptForCode` | Drive a sign-in from the test instead of a person. |
| `SponsorkitClient.ResetProcessState()` | Forget per-process state (counted nag runs, the dev-time check, `Retry-After` backoff) to simulate a new run of the app. |

`ResetProcessState()` is static and affects every client in the process, so don't run tests that use it in
parallel with each other. In xUnit, put them in one test class or one collection.

### Testing nags

Mock state lives in one instance, so test a nag with the real code path instead. A signed-out client makes no
requests, so this test needs no network:

```csharp title="NagTests.cs"
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Sponsorkit;
using Xunit;

public sealed class NagTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("sponsorkit-test-").FullName;
    private DateTimeOffset _now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private SponsorkitClient NewRun()
    {
        SponsorkitClient.ResetProcessState(); // a new process: this run counts again
        return new SponsorkitClient(new SponsorkitOptions
        {
            GitHub = "octocat",
            StorageDirectory = _dir,
            Environment = new Dictionary<string, string>(), // no CI, no SPONSORKIT_* variables
            Interactive = true,
            Clock = () => _now,
        });
    }

    private static NagOptions Options => new("my-cli") { Every = 3, OrEvery = TimeSpan.FromDays(7) };

    [Fact]
    public async Task DueOnTheThirdRunThenAfterAWeek()
    {
        Assert.False(await NewRun().Nag(Options).DueAsync(fc => !fc.SignedIn));
        Assert.False(await NewRun().Nag(Options).DueAsync(fc => !fc.SignedIn));

        var nag = NewRun().Nag(Options);
        Assert.True(await nag.DueAsync(fc => !fc.SignedIn));
        nag.Shown();

        _now = _now.AddDays(8);
        Assert.True(await NewRun().Nag(Options).DueAsync(fc => !fc.SignedIn));
    }

    [Fact]
    public async Task NeverInCi()
    {
        var sk = new SponsorkitClient(new SponsorkitOptions
        {
            GitHub = "octocat",
            StorageDirectory = _dir,
            Environment = new Dictionary<string, string> { ["CI"] = "true" },
            Interactive = true,
        });
        for (var i = 0; i < 5; i++)
        {
            SponsorkitClient.ResetProcessState();
            Assert.False(await sk.Nag(Options).DueAsync(_ => true));
        }
    }

    public void Dispose() => Directory.Delete(_dir, recursive: true);
}
```

## Integration tests

To test a sign-in end to end, run a fake Sponsorkit server and point the client at it with `ApiBaseUrl`. Pass an
`OpenBrowser` callback that requests the URL with an `HttpClient` (following redirects, as a browser would), or a
`PromptForCode` that returns a known code for paste-back. The SDK's own conformance suite does exactly this
against `sdks/conformance/server.ts`; see [self-hosting](../../reference-http/self-hosting.md) to run the real
service locally instead.

## In CI and for users

| Goal | Set |
|---|---|
| No network, no disk, no nags: the SDK does nothing | `SPONSORKIT_DISABLE=1` |
| Deterministic results in end-to-end tests of your app | `SPONSORKIT_MOCK=<preset>` |
| No nags, everything else normal | `SPONSORKIT_NO_NAG=1` (CI systems usually set `CI`, which has the same effect) |

More patterns, in every language, are in [test your integration](../../guides/mock-mode.md).
