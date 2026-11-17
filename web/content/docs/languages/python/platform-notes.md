---
title: Python platform notes
description: Supported Python versions, how the async variants work, threads and processes, opening the browser on each OS, where state is kept, proxies, typing and freezing apps.
sidebar_label: Platform notes
order: 90
---

## Python versions and operating systems

The package supports CPython 3.10 to 3.13 on Linux, macOS and Windows, and is tested on 3.10 and 3.13. Its only
dependency is `httpx` (`>=0.24,<1`).

It ships `py.typed`, and option values with a fixed set of choices are `Literal` type aliases (`SignInMethod`,
`Frequency`, `Provider`, `Status`, `ErrorCode`, `MockPreset`), so mypy and Pyright catch a misspelled
`frequency="montly"` or error code before you run anything.

## Sync and async

The client is synchronous at its core. Each blocking method has an async variant that runs it in a worker thread
with `asyncio.to_thread`:

| Blocking | Async |
|---|---|
| `get_financial_contribution()` | `aget_financial_contribution()` |
| `sign_in()` | `asign_in()` |
| `open_checkout()` | `aopen_checkout()` |
| `sign_out()` | `asign_out()` |
| `is_signed_in()` | `ais_signed_in()` |
| `nag.due()`, `nag.shown()` | `nag.adue()`, `nag.ashown()` |
| `verify_session()` | `averify_session()` (native `httpx.AsyncClient`, no thread) |

That makes them safe to await from any event loop (asyncio, a Textual app, a Jupyter notebook) without blocking
it, and it means the async and sync APIs behave identically. A long `asign_in()` occupies one thread of the
loop's default executor while it waits. Cancellation is described in
[Errors and cancellation](errors.md#cancellation).

In a GUI toolkit with its own event loop (Qt, Tk, wx), call the blocking methods from a worker thread, or use the
async variants with an asyncio integration, and keep `sign_in()` and `open_checkout()` off the UI thread.

## Threads and processes

- Clients for the same targets share one lock per state file inside a process, so several threads, or several
  client instances, can read and update the state without losing writes.
- Writes are atomic (a temporary file renamed over the old one), so another process never reads a half-written
  file. A refresh writes its result back only if the stored session is still the one it used, so a sign-out in
  another process isn't undone by a late refresh.
- A few things are remembered per process rather than in the file: which nags have already counted this run, the
  outcome of the [development-time check](configuration.md#development-checks), and a `Retry-After` from the
  API. `reset_process_state()` forgets them (for tests).

## Opening the browser

Unless you pass `open_browser`, the client opens `http://` and `https://` URLs with the platform's launcher,
never through a shell:

| Platform | Launcher |
|---|---|
| macOS | `open <url>` |
| Windows | `rundll32 url.dll,FileProtocolHandler <url>` |
| Linux and other Unix | `xdg-open <url>` |
| `BROWSER` set, or no `xdg-open` | Python's [`webbrowser`](https://docs.python.org/3/library/webbrowser.html) module, which honours `BROWSER` |

A launcher that exits with status 0, or is still running after 1.5 seconds, counts as having opened the
browser; anything else counts as a failure, and the `auto` sign-in method falls back to paste-back.

Paste-back is chosen up front when `SSH_CONNECTION` or `SSH_TTY` is set, or, on Linux and other Unix systems, when
neither `DISPLAY` nor `WAYLAND_DISPLAY` is set (containers, servers, CI). See [Sign-in](sign-in.md#choosing-a-method).

## Where state is kept

The session token, the cached result and nag counters live in one JSON file per set of targets, named
`<targets_hash>.json`:

| OS | Directory |
|---|---|
| Linux and other Unix | `$XDG_CONFIG_HOME/sponsorkit`, or `$HOME/.config/sponsorkit` |
| macOS | `$HOME/Library/Application Support/sponsorkit` |
| Windows | `%APPDATA%\sponsorkit`, or `%USERPROFILE%\AppData\Roaming\sponsorkit` |

`sponsorkit.default_storage_dir()` returns the directory for the current machine. Relative paths in these
variables are ignored. When no directory can be determined (for example `HOME` is unset), the client keeps its
state in memory for its lifetime and logs a warning; it never writes to the current working directory, and
construction never fails because of it.

The directory is created with mode `0700` and files are written with mode `0600` on the first write. The format
is shared by all five SDKs, so a person who signs in through your Python tool is also signed in to your Go or
.NET tool with the same targets:

```jsonc title="<targets_hash>.json"
{
  "v": 1,
  "sessionToken": "sks_…",
  "cache": { "result": { … }, "storedAt": "2026-11-17T12:00:00.000Z" },
  "nags": { "my-cli": { "runs": 3, "lastShown": null } }
}
```

To keep state elsewhere:

- `storage_dir=...` uses another directory with the same file format, for example inside your app's own config
  directory.
- `storage=...` takes any object with `read(key) -> str | None`, `write(key, data)` and `delete(key)` methods
  (the [`Storage`](/docs/reference/python/storage) protocol; no subclassing needed), for example to keep the
  session token in an OS keychain. Keys are `targets_hash` values and values are the JSON text above. `write`
  must be atomic. `MemoryStorage` keeps everything in memory.

Mock mode and `SPONSORKIT_DISABLE` always use memory and never touch the disk.

## Networking

The client sends its requests with an `httpx.Client` it creates on first use (or the one you pass as
`http_client`). Every request carries a `sponsorkit-python/<version>` User-Agent, including requests sent
through your own client. Like any default httpx client, it honours the
`HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY` and `NO_PROXY` environment variables and `SSL_CERT_FILE`/`SSL_CERT_DIR`
for custom certificate authorities. For anything else (a corporate proxy configured in code, client
certificates, a custom transport), build your own `httpx.Client` and pass it; `request_timeout` still applies to
each request.

The loopback listener for sign-in binds `127.0.0.1` only, on a random port, and only while a sign-in is running.

## Freezing apps

The mock presets ship as a data file, `sponsorkit/mock_presets.json`, loaded with `importlib.resources`. If you
freeze your app (PyInstaller, Nuitka, cx_Freeze) and want mock mode to work in the frozen build, include that file
(for PyInstaller: `--collect-data sponsorkit`). Nothing else in the package needs data files.
