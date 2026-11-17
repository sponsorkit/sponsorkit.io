---
title: .NET quickstart
description: Build a small .NET CLI that checks for a contribution, signs supporters in, opens checkout and nags politely.
sidebar_label: Quickstart
order: 5
---

This page builds `my-cli`, a console app with four commands:

- `my-cli` does its normal work and, every 10 runs, asks people who don't contribute yet for support;
- `my-cli login` signs the user in with GitHub or Open Collective;
- `my-cli sponsor` opens the checkout and waits until the new contribution shows up;
- `my-cli logout` forgets the session on this machine.

## Create the project

The package isn't on NuGet yet, so pack it from the repository into a local folder first;
[Install](index.md#install) explains this and lists the registry commands to use after the first release:

```bash title="Terminal"
git clone https://github.com/sponsorkit/sponsorkit.io.git
dotnet pack sponsorkit.io/sdks/dotnet/src/Sponsorkit -c Release -o ~/local-nuget -p:Version=0.1.0-local.1
dotnet new console -n my-cli
cd my-cli
dotnet add package Sponsorkit --version 0.1.0-local.1 --source ~/local-nuget
```

The console template enables implicit usings, so `System`, `System.Linq`, `System.Threading` and
`System.Threading.Tasks` are already imported.

## Write the program

Replace `octocat` and `my-collective` with the accounts you receive sponsorships on. You need at least one of
the two.

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "octocat",               // your GitHub Sponsors login
    OpenCollective = "my-collective", // and/or your Open Collective slug
    AppName = "my-cli",               // shown on the consent screen
});

// Ctrl+C cancels a sign-in or checkout instead of killing the process.
using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

switch (args.FirstOrDefault())
{
    case "login":
        try
        {
            // Opens the browser, or prints a link and asks for a code over SSH.
            var fc = await sk.SignInAsync(cancellationToken: cts.Token);
            Console.WriteLine(fc.Active().Count > 0 ? "Thanks for supporting my-cli!" : "Signed in.");
            return 0;
        }
        catch (SponsorkitError e)
        {
            Console.Error.WriteLine($"Sign-in failed ({e.Code}): {e.Message}");
            return 1;
        }

    case "sponsor":
        // Signs in first if needed, opens the checkout, then polls until the new contribution appears.
        var result = await sk.OpenCheckoutAsync(new CheckoutOptions { Frequency = Frequencies.Monthly, Amount = 500 }, cts.Token);
        Console.WriteLine(result.Status == CheckoutStatus.Contributed
            ? $"Thank you! {result.Contribution!.Amount.Value / 100.0:0.00} {result.Contribution.Amount.Currency} received."
            : "No new contribution detected yet. It can take a minute to show up; run `my-cli` again later.");
        return 0;

    case "logout":
        await sk.SignOutAsync();
        Console.WriteLine("Signed out on this machine.");
        return 0;

    default:
        Console.WriteLine("Doing the real work of my-cli...");

        // At most every 10 runs, never in CI or when output is piped, and never for active contributors.
        var nag = sk.Nag(new NagOptions("my-cli") { Every = 10 });
        if (await nag.DueAsync(fc => fc.Active().Count == 0))
        {
            Console.Error.WriteLine($"Enjoying my-cli? Support it: {sk.CheckoutUrl(new CheckoutUrlOptions { Frequency = Frequencies.Monthly })}");
            Console.Error.WriteLine("Already a supporter? Run `my-cli login`.");
            nag.Shown();
        }
        return 0;
}
```

## Run it

```bash title="Terminal"
dotnet run              # the normal command; the nag can't show yet
dotnet run -- login     # opens the consent page
dotnet run              # now reads your contributions (cached for an hour)
dotnet run -- sponsor   # opens the checkout and waits
```

A few things to notice:

- **Nothing throws because of the network.** `GetFinancialContributionAsync` (which `DueAsync` calls) serves
  the local cache, or an empty result, when Sponsorkit or a provider is unreachable. Only actions the user asked
  for, like `login`, throw a [`SponsorkitError`](errors.md).
- **Signed-out users cost nothing.** Without a stored session there's no request at all.
- **Results are cached for an hour** in your user config folder, so running the CLI 50 times a day makes at most
  24 requests. See [contributions](contributions.md#caching-and-freshness).
- **The nag counts runs.** It stays quiet for the first 9 runs, and always in CI or when stdout or stderr is
  redirected. See [nag](nag.md).

## Try it without an account

Set `SPONSORKIT_MOCK` to pretend the user is signed in with a contribution. Nothing touches the network or the
disk:

```bash title="Terminal"
SPONSORKIT_MOCK=active-monthly dotnet run
SPONSORKIT_MOCK=none dotnet run -- sponsor
```

[Testing](testing.md) lists the presets and how to use mock mode from unit tests.

## Next steps

- Decide what contributing unlocks with the [contribution helpers](contributions.md#helpers).
- Make `login` robust with a [timeout and paste-back](sign-in.md).
- Verify supporters on your server with [`SponsorkitServer`](backend-verification.md).
