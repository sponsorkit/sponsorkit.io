---
title: Supported platforms
description: Minimum runtime versions, what CI tests, which sign-in methods each SDK supports and where each one stores its state.
order: 20
---

## Runtime versions

| SDK | Minimum | Tested in CI |
|---|---|---|
| JavaScript / TypeScript | Node 20 (`engines`), current Bun and Deno, evergreen browsers | Unit, DOM and conformance tests on Bun; the built package on Node 22 (ESM and CommonJS) |
| .NET | Anything that runs `netstandard2.0` or `net8.0` | .NET 10 |
| Python | 3.10 | 3.10 and 3.13 |
| Go | 1.23 | 1.23 and 1.25, with the race detector |
| Rust | 1.85 (MSRV) | 1.85 and stable |

Every SDK passes the same language-neutral conformance suite (`sdks/conformance`), which pins the behaviour
described in these docs: caching, the error contract, sign-in flows, checkout detection and the storage format.

## Sign-in methods

| SDK | Get contributions | Sign-in methods |
|---|---|---|
| JS/TS, browser entry | `getFinancialContribution()` | popup, redirect |
| JS/TS, `node` entry | `getFinancialContribution()` | loopback, paste |
| .NET | `GetFinancialContributionAsync(ct)` | loopback, paste |
| Python | `get_financial_contribution()` | loopback, paste |
| Go | `GetFinancialContribution(ctx)` | loopback, paste |
| Rust | `get_financial_contribution(GetOptions::default()).await?` | loopback, paste |

Native SDKs pick the method automatically: loopback when a browser can be opened on this machine, paste-back
over SSH, without a graphical display, or when the loopback listener can't start. You can force either one.
[Sign-in & sessions](../concepts/sessions.md) explains each flow.

## Where state is stored

Each SDK keeps one small JSON document per [target set](../concepts/targets.md): the session token, the cached
result and nag counters. The file format and default locations are the same in every SDK, so tools written in
different languages that check the same targets on the same machine read the same sign-in.

| Platform | Location |
|---|---|
| Linux and other Unix | `$XDG_CONFIG_HOME/sponsorkit/`, else `~/.config/sponsorkit/` |
| macOS | `~/Library/Application Support/sponsorkit/` |
| Windows | `%APPDATA%\sponsorkit\` |
| Browsers | `localStorage`, key `sponsorkit:<targets_hash>` |

- **Files** are named `<targets_hash>.json`. The directory is created with mode `0700` and files with `0600`;
  on Windows the user profile's default permissions apply. Writes go to a temporary file that is then renamed,
  so a crash never leaves a half-written file.
- **No config directory.** When none can be determined (for example, `HOME` is unset in a container), the SDK
  keeps its state in memory for the life of the process. It never writes to the current directory.
- **Your own location.** Native SDKs accept a storage directory (`storageDir`, `StorageDirectory`,
  `storage_dir`, `StorageDir`). JavaScript, .NET, Python and Go also accept a custom storage backend, for example
  one backed by the OS keychain; there is no built-in keychain store.

## Platform notes

- **Browsers need a secure context.** The browser SDK hashes the target set and creates PKCE challenges with Web
  Crypto (`crypto.subtle`), which browsers only provide on `https://` pages and `localhost`.
- **Popups.** Call `signIn()` and `openCheckout()` directly from a click handler. Without a user gesture the
  popup is blocked; set `returnTo` to fall back to a full-page redirect.
- **Containers and CI.** With no display and no TTY, sign-in uses paste-back, and the nag helper stays quiet (it
  needs a terminal, and it is always off when `CI` is set). Set `SPONSORKIT_DISABLE=1` to turn Sponsorkit off
  entirely, with no network or disk access.
- **Custom HTTP clients.** For proxies or custom transports, JavaScript accepts a `fetch` function, .NET an
  `HttpClient`, Python an `httpx.Client` and Go an `*http.Client`. Rust uses its own `reqwest` client.
