---
title: Sign-in in .NET
description: How SignInAsync signs supporters in with loopback or paste-back, how Auto picks between them, and how to bound, cancel and customize a sign-in.
sidebar_label: Sign-in
order: 20
---

Supporters sign in with the GitHub or Open Collective account they pay with. Sponsorkit runs the OAuth flow and
gives the SDK a session token, which it stores locally and uses for every later check. Sign-in only happens
when you call `SignInAsync` (or `OpenCheckoutAsync` for a signed-out user); nothing in the SDK signs anyone in
implicitly. The concepts behind it are in [sign-in & sessions](../../concepts/sessions.md).

## The two flows

| Method | Used when | What the user sees |
|---|---|---|
| Loopback | A desktop session with a browser | The SDK listens on `http://127.0.0.1:<random port>/callback` and opens the system browser on the consent page. After approval the browser is redirected back to that port and shows "You can close this window". |
| Paste-back | SSH, containers, servers without a display | The SDK prints a link to stderr and asks for a code. The user opens the link on any device, approves, and pastes the code shown back into the terminal. |

Both use PKCE: the code is useless without a secret only this process holds.

### How `Auto` chooses

`SignInMethod.Auto` (the default) picks paste-back up front when:

- `SSH_CONNECTION` is set, or
- on Linux and other Unix systems, neither `DISPLAY` nor `WAYLAND_DISPLAY` is set.

Otherwise it tries loopback and falls back to paste-back if `127.0.0.1` can't be bound or the browser can't be
opened. When you supply your own `OpenBrowser` callback, the SSH and display checks are skipped and your callback decides
(throw from it to fall back to paste-back).

Force one flow for the whole client with `SponsorkitOptions.SignInMethod`, or for one call:

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", AppName = "my-cli" });

// `my-cli login --paste` for users who know their browser is on another machine.
var method = args.Contains("--paste") ? SignInMethod.Paste : SignInMethod.Auto;
var fc = await sk.SignInAsync(new SignInOptions { Method = method });
Console.WriteLine($"Signed in as {fc.Supporter?.Identities[0].Handle}");
```

A forced `Loopback` that can't bind `127.0.0.1` throws `network_error`. If it can't open a browser, it prints
the URL to stderr and keeps waiting for the callback.

## A login command with timeout and cancellation

A sign-in waits for a human, so it is bounded by `SignInTimeout` (default 5 minutes) and throws `timeout` when
that runs out. Cancelling the `CancellationToken` throws `cancelled`. Both are `SponsorkitError`s, so one
`catch` covers every outcome:

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "octocat",
    AppName = "my-cli",
    SignInTimeout = TimeSpan.FromMinutes(2),
});

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

try
{
    var fc = await sk.SignInAsync(cancellationToken: cts.Token);
    Console.WriteLine(fc.Active().Count > 0 ? "Thanks for supporting my-cli!" : "Signed in.");
    return 0;
}
catch (SponsorkitError e)
{
    Console.Error.WriteLine(e.Code switch
    {
        SponsorkitErrorCodes.Cancelled => "Sign-in cancelled.",
        SponsorkitErrorCodes.Timeout => "Sign-in timed out. Run `my-cli login` to try again.",
        SponsorkitErrorCodes.AccessDenied => "You declined access, so nothing was stored.",
        SponsorkitErrorCodes.NetworkError => $"Could not reach Sponsorkit: {e.Message}",
        _ => $"Sign-in failed ({e.Code}): {e.Message}",
    });
    return 1;
}
```

The other codes `SignInAsync` can throw (`invalid_state`, `provider_error`, `invalid_code`, `disabled` and
`invalid_config`) are listed in [errors & cancellation](errors.md#error-codes).

## Adding a second identity

A supporter who sponsors on GitHub and contributes on Open Collective can connect both. While signed in, call
`SignInAsync` with the other provider; the identity is added to the same session and the next result includes
contributions from both:

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", OpenCollective = "my-collective" });

var fc = await sk.GetFinancialContributionAsync();
var connected = fc.Supporter?.Identities.Select(i => i.Provider).ToList() ?? new List<string>();
if (fc.SignedIn && !connected.Contains(Providers.OpenCollective))
{
    fc = await sk.SignInAsync(new SignInOptions { Provider = Providers.OpenCollective });
}
Console.WriteLine($"{fc.Contributions.Count} contribution(s) across {fc.Supporter?.Identities.Count ?? 0} identities");
```

- `Provider` must be one of your configured targets, otherwise the call throws `invalid_config`. On a first
  sign-in it skips the provider picker.
- `Supporter.Id` doesn't change: it comes from the first identity of the session.
- If the stored session turns out to be dead, the SDK starts a fresh session with the new identity instead of
  failing.

## Reconnecting an identity

Provider permissions can expire before the session does: Open Collective sign-ins last 90 days, and GitHub
keeps a limited number of tokens per user. That doesn't sign the supporter out. The identity gets
`NeedsReconnect == true`, its provider is listed in `Unavailable`, and that provider's contributions come from
the local cache with `Stale == true`. Sign in again with that provider to refresh it:

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", OpenCollective = "my-collective" });

var fc = await sk.GetFinancialContributionAsync();
foreach (var identity in fc.Supporter?.Identities ?? Array.Empty<Identity>())
{
    if (identity.NeedsReconnect)
        Console.Error.WriteLine($"Your {identity.Provider} connection expired. Run `my-cli login --{identity.Provider}`.");
}

if (args.Length > 1 && args[0] == "login" && args[1].StartsWith("--", StringComparison.Ordinal))
    await sk.SignInAsync(new SignInOptions { Provider = args[1].Substring(2) });
```

## Customizing the browser and the prompt

Desktop apps usually want to open the URL themselves and show their own "paste the code" dialog. Two callbacks
replace the defaults:

```csharp title="Program.cs"
using System.Diagnostics;
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "octocat",
    AppName = "my-desktop-app",
    // Throwing here makes Auto fall back to paste-back.
    OpenBrowser = (url, ct) =>
    {
        using var _ = Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        return Task.CompletedTask;
    },
    // Return the code the user typed; an empty string throws `cancelled`.
    PromptForCode = async (url, ct) =>
    {
        Console.Error.WriteLine($"Open {url} and paste the code here:");
        return await Task.Run(Console.ReadLine, ct) ?? "";
    },
});

await sk.SignInAsync();
```

- `OpenBrowser` receives the full URL and the sign-in's `CancellationToken`. The SDK accepts the callback while
  your opener is still running, so it may return before or after the browser is up.
- The default opener runs `open` on macOS, `xdg-open` on Linux and the shell on Windows. It counts as failed
  when the opener exits non-zero, and as opened when it is still running after about 1.5 seconds.

:::note[Apps that read standard input]
The default prompt reads a line from standard input, and a blocking console read can't be cancelled. After a
cancelled or timed-out paste-back, that read stays pending: the next line typed goes to the next Sponsorkit
prompt, or is discarded if none follows. If your app reads stdin itself after an abandoned sign-in, supply
`PromptForCode`.
:::

## Signing out

`SignOutAsync` deletes the stored session token and cached result on this machine, and keeps the nag counters.
There's no server-side session to end. To revoke access everywhere, the supporter removes the Sponsorkit app in
their GitHub or Open Collective settings.

```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat" });
await sk.SignOutAsync();
Console.WriteLine(sk.IsSignedIn()); // False
```

`SignOutAsync` throws `invalid_config` only if the state file can't be written. The
[native apps guide](../../guides/native-apps.md) covers the same flows across all languages.
