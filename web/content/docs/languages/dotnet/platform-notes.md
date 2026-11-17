---
title: .NET platform notes
description: The netstandard2.0 and net8.0 builds, where state is kept on Windows, macOS and Linux, browsers and SSH, threading, and custom storage backends.
sidebar_label: Platform notes
order: 90
---

## `net8.0` and `netstandard2.0`

The package ships two builds with the same public API:

| | `net8.0` | `netstandard2.0` |
|---|---|---|
| Used by | .NET 8 and later | .NET Framework 4.6.2+ and other .NET Standard 2.0 runtimes |
| Dependencies | none | `System.Text.Json` (NuGet) |
| State file permissions on Linux and macOS | Created as `0600` (directory `0700`) through `UnixCreateMode` | Created, then `chmod`ed through `libc`, best effort |
| Replacing the state file | `File.Move(..., overwrite: true)` | `File.Replace`, or `File.Move` for a new file |

Behaviour is otherwise identical: both builds compile from the same source, and the differences above are the
only `#if` branches in it.

Everything is `async` and returns `Task`, with `ConfigureAwait(false)` throughout, so the SDK doesn't capture your
synchronization context. You can `await` it from a WPF or WinForms event handler without deadlocks, and blocking
on it with `.GetAwaiter().GetResult()` in a console app works too (though `await` is better).

The SDK serializes JSON with reflection-based `System.Text.Json`. It isn't annotated for trimming or Native AOT,
so test your app if you publish it trimmed.

## Where state is kept

One JSON file per target set, `<StorageDirectory>/<TargetsHash>.json`, holds the session token, the cached result
and the nag counters. Its format is shared with the other Sponsorkit SDKs, so a Python and a .NET tool with the
same targets share a sign-in.

| OS | Default `StorageDirectory` |
|---|---|
| Windows | `%APPDATA%\sponsorkit` |
| macOS | `~/Library/Application Support/sponsorkit` |
| Linux and other Unix systems | `$XDG_CONFIG_HOME/sponsorkit`, or `~/.config/sponsorkit` |

- The directory is created as `0700` and files as `0600` on Unix systems. Writes are atomic: a temp file is
  written, flushed and renamed over the old one.
- If no per-user folder can be determined (for example `HOME` is unset in a service), state is kept in memory for
  the life of the client. The SDK never writes to the working directory, and the constructor never fails over
  storage.
- Reading never throws. A corrupt or partly invalid file reads as "nothing stored" for the broken parts.
- Storage failures while refreshing the cache or counting nag runs are ignored, because the SDK must never break
  your app. Only `SignInAsync` and `SignOutAsync`, which the user asked for, throw `invalid_config` when the file
  can't be written.
- Several clients, threads and processes can share the directory. A background refresh never overwrites a
  sign-in or sign-out that happened in the meantime.

Set `StorageDirectory` to keep the file next to your app's own settings, for example in a portable app.

### A custom storage backend

Implement `ISponsorkitStorage` to keep the state somewhere else, such as an OS keychain or your app's settings
store. Keys are target hashes and values are the JSON documents. `Write` must be atomic: a concurrent `Read` sees
the old or the new value, never a mix.

```csharp title="SettingsStorage.cs"
using System.Collections.Concurrent;
using Sponsorkit;

/// <summary>Keeps Sponsorkit's state in the app's own settings store (here, a dictionary).</summary>
public sealed class SettingsStorage : ISponsorkitStorage
{
    private readonly ConcurrentDictionary<string, string> _settings = new();

    public string? Read(string key) => _settings.TryGetValue("sponsorkit:" + key, out var json) ? json : null;

    public void Write(string key, string json) => _settings["sponsorkit:" + key] = json;
}
```

Pass it as `new SponsorkitOptions { GitHub = "octocat", Storage = new SettingsStorage() }`. `Storage` takes
precedence over `StorageDirectory`. Exceptions your backend throws are handled like file errors above.

## Browsers, SSH and containers

- **Opening the browser.** The default opener uses the shell on Windows (`UseShellExecute`), `open` on macOS and
  `xdg-open` on Linux. Replace it with the `OpenBrowser` option, for example in a sandboxed desktop app.
- **SSH and headless Linux.** With `SignInMethod.Auto`, an SSH session (`SSH_CONNECTION`) or a Linux session
  without `DISPLAY` and `WAYLAND_DISPLAY` signs in with paste-back. See [sign-in](sign-in.md#how-auto-chooses).
- **Containers.** The loopback flow binds `127.0.0.1` inside the container, which the host's browser can't reach.
  Paste-back works everywhere; force it with `SignInMethod.Paste` when your app runs in a container with a
  display.
- **Messages.** The SDK writes its prompts and fallback URLs to **stderr**, never stdout, so your program's output
  stays clean.

## Servers and backends

`SponsorkitClient` represents one end user on one machine. Don't use it in a web server to track your visitors:
it would share one session among all of them. On a server, use
[`SponsorkitServer.VerifySessionAsync`](backend-verification.md), which needs no storage and no browser.

## Networking

- One shared `HttpClient` is used by default. Pass your own with `HttpClient` to add a proxy, custom handlers or
  logging; the SDK doesn't dispose it.
- Every request has a 30-second timeout (`RequestTimeout`), applied per request even if your `HttpClient` has a
  longer `Timeout`.
- Requests carry a `User-Agent` of `sponsorkit-dotnet/<version>`.
- The only host contacted is `ApiBaseUrl` (`https://sponsorkit.io` by default). See
  [self-hosting](../../reference-http/self-hosting.md) to run your own.
