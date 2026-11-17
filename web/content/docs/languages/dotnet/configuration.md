---
title: Configuring the .NET SDK
description: Every SponsorkitOptions property with its default, how the constructor validates them, and the environment variables the SDK reads.
sidebar_label: Configuration
order: 10
---

All configuration goes into a `SponsorkitOptions` object passed to the `SponsorkitClient` constructor. The
constructor validates everything synchronously, does no I/O, and throws `SponsorkitError` with code
`invalid_config` when something is wrong, so configuration mistakes show up the first time your app starts.

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "octocat",
    OpenCollective = "my-collective",
    AppName = "my-cli",
    CacheTtl = TimeSpan.FromHours(6),            // fewer requests; contributions rarely change
    SignInMethod = SignInMethod.Auto,            // loopback, falling back to paste-back
    SignInTimeout = TimeSpan.FromMinutes(3),
    RequestTimeout = TimeSpan.FromSeconds(10),
});

Console.WriteLine(string.Join(", ", sk.Targets)); // github:octocat, opencollective:my-collective
```

## Options

| Property | Type | Default | What it does |
|---|---|---|---|
| `GitHub` | `string?` | `null` | Your GitHub Sponsors login (user or organization). |
| `OpenCollective` | `string?` | `null` | Your Open Collective slug. At least one of `GitHub` and `OpenCollective` is required. |
| `AppName` | `string?` | `null` | Shown on the consent page as "says it is". 1–64 characters after trimming. |
| `CacheTtl` | `TimeSpan` | 1 hour | How long a result is served from the local cache. Values below 60 seconds are raised to 60 seconds. |
| `Mock` | `SponsorkitMock?` | `null` | Mock mode: a preset name such as `"active-monthly"` or `SponsorkitMock.WithContributions(...)`. Wins over `SPONSORKIT_MOCK`. See [testing](testing.md). |
| `StorageDirectory` | `string?` | per-user config folder | Where the state file lives. See [platform notes](platform-notes.md#where-state-is-kept). |
| `Storage` | `ISponsorkitStorage?` | `null` | A custom storage backend. Takes precedence over `StorageDirectory`. |
| `ApiBaseUrl` | `string?` | `https://sponsorkit.io` | The Sponsorkit origin, for [self-hosting](../../reference-http/self-hosting.md) and tests. Must be an absolute http(s) URL; trailing slashes are removed. |
| `SignInMethod` | `SignInMethod` | `Auto` | `Auto`, `Loopback` or `Paste`. See [sign-in](sign-in.md). |
| `OpenBrowser` | `Func<string, CancellationToken, Task>?` | system browser | Opens the sign-in or checkout URL. Throwing counts as "the browser could not open". |
| `PromptForCode` | `Func<string, CancellationToken, Task<string>>?` | reads a line from stdin | Asks for the paste-back code; receives the URL. An empty answer throws `cancelled`. |
| `SignInTimeout` | `TimeSpan` | 5 minutes | How long a sign-in may take before it throws `timeout`. Must be positive or `Timeout.InfiniteTimeSpan`. |
| `Interactive` | `bool?` | `null` (detect) | Overrides the nag's terminal check. By default the terminal is interactive when neither stdout nor stderr is redirected. |
| `Environment` | `IReadOnlyDictionary<string, string>?` | `null` (process environment) | Replaces the environment variables below for this instance. It is not merged: a missing key counts as unset. |
| `DevChecks` | `bool?` | `null` | Checks once per process that your targets exist. `null` means "only when `SPONSORKIT_DEV_CHECKS` is set". |
| `CheckoutPollInterval` | `TimeSpan` | 60 seconds | How often `OpenCheckoutAsync` polls for the new contribution. |
| `Clock` | `Func<DateTimeOffset>?` | `DateTimeOffset.UtcNow` | The current time, for cache expiry and nag timers. Handy in tests. |
| `HttpClient` | `HttpClient?` | a shared internal client | Bring your own, for example to add a proxy or a logging handler. |
| `RequestTimeout` | `TimeSpan` | 30 seconds | Timeout of each HTTP request. `TimeSpan.Zero` or `Timeout.InfiniteTimeSpan` disables it; negative values throw `invalid_config`. |

The per-property details, with links between related types, are in the
[`SponsorkitOptions` reference](/docs/reference/dotnet/sponsorkitoptions).

### Targets

`GitHub` and `OpenCollective` are trimmed and lowercased, then validated: a GitHub login is 1–39 letters, digits
or single hyphens; an Open Collective slug is letters, digits and hyphens. The canonical form, such as
`github:octocat`, is what `sk.Targets` returns and what every result carries in `Targets`. The SHA-256 of the
target list (`sk.TargetsHash`) names the state file, so two apps with the same targets share a session. See
[targets](../../concepts/targets.md).

### What the constructor rejects

Each of these throws `SponsorkitError` with `Code == "invalid_config"`:

- no target, or a malformed login or slug;
- an `AppName` that is only whitespace or longer than 64 characters (an empty string counts as not set);
- an `ApiBaseUrl` that isn't an absolute http or https URL;
- a `SignInTimeout` of zero or less (other than `Timeout.InfiniteTimeSpan`);
- a negative `RequestTimeout`;
- an unknown mock preset, from `Mock` or `SPONSORKIT_MOCK`.

`ArgumentNullException` is thrown only for a `null` options object.

## Environment variables

The SDK reads these from the process environment, or from the `Environment` option when you set one. A
variable counts as set when it is non-empty and not `0` or `false` (case-insensitive).

| Variable | Effect |
|---|---|
| `SPONSORKIT_DISABLE` | Turns the SDK into a no-op: no network, no disk. Results have `Disabled == true`; `SignInAsync` and `OpenCheckoutAsync` throw `disabled`; nags never show. Wins over mock mode. |
| `SPONSORKIT_MOCK` | Selects a [mock preset](testing.md#presets), for example `active-monthly`. The `Mock` option wins over it. |
| `SPONSORKIT_NO_NAG` | `DueAsync` returns `false` unless called with `force: true`. |
| `CI` | Same as `SPONSORKIT_NO_NAG`. Most CI systems set it. |
| `SPONSORKIT_DEV_CHECKS` | Turns on the dev-time target check when `DevChecks` is `null`. |

`SPONSORKIT_DISABLE` is the switch to document for your users: anyone who doesn't want your app to talk to
Sponsorkit can set it.

### The dev-time target check

.NET has no reliable "this is a development build" signal, so the target check is off unless you ask for it.
Turn it on while you integrate:

```bash title="Terminal"
SPONSORKIT_DEV_CHECKS=1 dotnet run
```

The first `GetFinancialContributionAsync`, `SignInAsync` or `OpenCheckoutAsync` in the process then asks
Sponsorkit whether each target exists and has a sponsor listing, and throws `invalid_config` naming the missing
ones. If Sponsorkit can't be reached, the check passes silently.

## Client properties

| Member | Description |
|---|---|
| `Targets` | The canonical target strings, for example `github:octocat`. |
| `TargetsHash` | The hash that names this target set's state file. |
| `IsDisabled` | Whether `SPONSORKIT_DISABLE` is set for this instance. |
| `IsMock` | Whether mock mode is active. |
| `ApiBaseUrl` | The origin in use, after normalization. |
| `IsSignedIn()` | Whether a session token is stored. No network access. |

## With dependency injection

A client is cheap to keep and safe to share between threads, so register one instance:

```csharp title="Program.cs"
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit;

var services = new ServiceCollection();
services.AddSingleton(new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", AppName = "my-app" }));

using var provider = services.BuildServiceProvider();
var sk = provider.GetRequiredService<SponsorkitClient>();
Console.WriteLine(sk.IsSignedIn() ? "Signed in" : "Signed out");
```

This needs the `Microsoft.Extensions.DependencyInjection` package; the generic host and ASP.NET Core include it.
