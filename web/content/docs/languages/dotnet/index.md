---
title: Sponsorkit for .NET
description: Install the Sponsorkit NuGet package and use it from console apps, CLIs, desktop apps and ASP.NET Core backends.
sidebar_label: Overview
---

The `Sponsorkit` package tells your .NET app what the current user has contributed to your GitHub Sponsors and
Open Collective accounts, and sends them to contribute. It's built for the places .NET code runs on a user's
machine (console tools, `dotnet` global tools, and desktop apps such as WPF, WinForms or Avalonia), and it has a
server-side helper for verifying supporters in ASP.NET Core or any other backend.

There's no Sponsorkit account or API key. You name the accounts you receive money on, and the SDK does the rest.

## Requirements

| Target framework | Runs on | Dependencies |
|---|---|---|
| `net8.0` | .NET 8, 9, 10 and later | None |
| `netstandard2.0` | .NET Framework 4.6.2 or later, and other .NET Standard 2.0 runtimes | `System.Text.Json` |

NuGet picks the right build for your project. The public API is the same on both. The few runtime differences are
listed in [platform notes](platform-notes.md).

## Install

:::tabs{group="nuget"}
```bash tab=".NET CLI" key="dotnet-cli"
dotnet add package Sponsorkit
```

```xml tab="PackageReference" key="packagereference"
<ItemGroup>
  <PackageReference Include="Sponsorkit" Version="0.1.0" />
</ItemGroup>
```

```xml tab="Central Package Management" key="cpm"
<!-- Directory.Packages.props -->
<ItemGroup>
  <PackageVersion Include="Sponsorkit" Version="0.1.0" />
</ItemGroup>

<!-- your .csproj -->
<ItemGroup>
  <PackageReference Include="Sponsorkit" />
</ItemGroup>
```

```bash tab="Paket" key="paket"
dotnet paket add Sponsorkit --project src/MyApp/MyApp.csproj
```

```powershell tab="Package Manager Console" key="pmc"
Install-Package Sponsorkit
```

```csharp tab="File-based app" key="file-based"
#:package Sponsorkit@0.1.0
```
:::

The **File-based app** tab is for single-file apps run with `dotnet run app.cs` (.NET 10 and later). Every type lives in the
`Sponsorkit` namespace.

:::note[Pre-release]
If NuGet can't find the package, it hasn't been published yet. [Build from source](../../install/from-source.md#dotnet)
packs it into a local folder you can use as a package source.
:::

## A first call

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "octocat",               // your GitHub Sponsors login
    OpenCollective = "my-collective", // and/or your Open Collective slug
    AppName = "my-cli",               // shown on the consent screen
});

// Never throws because of the network. Signed out, it returns at once without a request.
var fc = await sk.GetFinancialContributionAsync();
Console.WriteLine(fc.SignedIn
    ? $"Active contributions: {fc.Active().Count}"
    : $"Not signed in. Support my-cli: {sk.CheckoutUrl()}");
```

The constructor only validates your configuration; it does no I/O. Create one client per target set and reuse
it: instances are thread-safe, so a singleton (or `services.AddSingleton(...)`) works well.

## In this section

| Page | What it covers |
|---|---|
| [Quickstart](quickstart.md) | A complete CLI: check, `login`, `sponsor` and `logout` commands. |
| [Configuration](configuration.md) | Every `SponsorkitOptions` property with its default, and the environment variables. |
| [Sign-in](sign-in.md) | Loopback and paste-back sign-in, timeouts, cancellation and a second identity. |
| [Contributions](contributions.md) | `GetFinancialContributionAsync`, the result, the filter helpers and caching. |
| [Checkout](checkout.md) | `CheckoutUrl` for links and `OpenCheckoutAsync` to wait for a new contribution. |
| [Nag](nag.md) | A polite "please support" message every N runs or N days. |
| [Testing](testing.md) | Mock mode, presets, and test hooks for time, environment and storage. |
| [Backend verification](backend-verification.md) | `SponsorkitServer.VerifySessionAsync` in ASP.NET Core. |
| [Errors & cancellation](errors.md) | `SponsorkitError`, its codes, and how `CancellationToken` behaves per method. |
| [Platform notes](platform-notes.md) | `netstandard2.0` vs `net8.0`, storage locations, browsers, SSH, threading, custom storage. |

Every public type and member is listed in the generated [.NET API reference](/docs/reference/dotnet).
