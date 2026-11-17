---
title: Rust platform notes
description: Tokio runtimes and synchronous apps, sharing a client across tasks, where state is kept, opening the browser, stdin, TLS roots and proxies.
sidebar_label: Platform notes
order: 90
---

## Tokio {#tokio}

The SDK is async and built on Tokio: it uses Tokio's timers, its TCP listener for loopback sign-in and
`spawn_blocking` to launch the browser. Call it from inside a Tokio 1.x runtime, either flavour:

| Runtime | Works | Notes |
|---|---|---|
| `#[tokio::main]` (multi-thread) | Yes | Needs Tokio's `macros` and `rt-multi-thread` features. |
| `#[tokio::main(flavor = "current_thread")]` | Yes | Needs Tokio's `macros` and `rt` features. |
| `#[tokio::test]` | Yes | The default test runtime is current-thread. |
| async-std, smol, a bare executor | No | Tokio's timers and sockets panic outside a Tokio runtime. |

There's no blocking API. A synchronous app can build a small runtime just for Sponsorkit calls:

```rust title="src/main.rs"
use sponsorkit::{GetOptions, Options, Sponsorkit};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // A synchronous app: build a small runtime just for Sponsorkit calls.
    let rt = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let sk = Sponsorkit::new(Options { github: Some("octocat".into()), ..Default::default() })?;
    let fc = rt.block_on(sk.get_financial_contribution(GetOptions::default()))?;
    println!("signed in: {}, active: {}", fc.signed_in, fc.active().len());
    Ok(())
}
```

`enable_all()` matters: the SDK needs both the time and the I/O drivers. Don't call `block_on` from inside another
runtime's async code; Tokio panics on that. `Sponsorkit::new` itself is synchronous and does no I/O, so you can
create the client anywhere.

## Sharing a client

`Sponsorkit` holds an `Arc` inside, so `clone()` is cheap and every clone shares the same state (including mock
state). It's `Send + Sync`, and the futures of its async methods are `Send`, so you can store it in your app state
and use it from `tokio::spawn`:

```rust title="src/main.rs"
use sponsorkit::{GetOptions, Options, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options { github: Some("octocat".into()), ..Default::default() })?;

    // Check in the background while the app starts; the client is cheap to clone.
    let background = sk.clone();
    let check = tokio::spawn(async move { background.get_financial_contribution(GetOptions::default()).await });

    println!("Starting up...");
    let fc = check.await.expect("task panicked")?;
    println!("{} active contribution(s)", fc.active().len());
    Ok(())
}
```

Create one client per target set and reuse it. Two clients for the same targets and storage directory share the
state file, which is safe (see below) but does twice the work.

### Blocking work

Reading and writing the state file uses small synchronous file operations on the calling task; they take
microseconds on a local disk. Launching the browser runs on Tokio's blocking pool. The default paste-back prompt
reads stdin on a dedicated background thread ([below](#stdin)).

## Where state is kept

The SDK keeps one small JSON file per target set: the session token, the last result and the nag counters.

| OS | Default directory |
|---|---|
| Linux and other Unix systems | `$XDG_CONFIG_HOME/sponsorkit`, else `~/.config/sponsorkit` |
| macOS | `~/Library/Application Support/sponsorkit` |
| Windows | `%APPDATA%\sponsorkit` |

Set `Options::storage_dir` to use another directory, for example one inside your app's own config folder. Relative
values of `XDG_CONFIG_HOME`, `HOME` or `APPDATA` are ignored. When no directory can be determined (for example in
a service without `HOME`), the session is kept in memory for the life of the client and nothing is written; the
SDK never falls back to the working directory.

- **File name:** `<targets hash>.json`, where the hash is the lowercase hex SHA-256 of the canonical target string
  (`sk.targets().hash()`). Apps with the same targets share a file, and so a sign-in, on purpose.
- **Format:** `{ "v": 1, "sessionToken": …, "cache": { "result": …, "storedAt": … }, "nags": { … } }`, the same in
  every Sponsorkit SDK ([storage format](../../reference-http/protocol.md#storage-format)), so a Rust CLI and, say,
  a Python tool for the same project share one sign-in.
- **Permissions:** on Unix the directory is created `0700` and the file `0600`, because the session token is a
  credential.
- **Writes are atomic** (a temporary file, then a rename), so a crash never leaves a half-written file. Within a
  process, read-modify-write cycles are serialized; across processes the last writer wins.
- **Reads never fail:** an unparseable file, a wrong type or a malformed token reads as absent, and keys written by
  a newer SDK are kept when the file is rewritten.

## Opening the browser

Sign-in and checkout open the system browser with `open` on macOS, `rundll32 url.dll,FileProtocolHandler` on
Windows and `xdg-open` elsewhere, without a shell. A launcher that exits with an error within 1.5 seconds counts as
a failure (with `SignInMethod::Auto`, sign-in then falls back to paste-back); one that's still running is assumed
to be opening the browser.

Over SSH (`SSH_CONNECTION` or `SSH_TTY` set), and on Linux and other Unix systems without `DISPLAY` or
`WAYLAND_DISPLAY`, `Auto` doesn't try a browser at all. A GUI app can supply `Options::open_browser` to open URLs
its own way; see [custom browser and prompt](sign-in.md#custom-browser-and-prompt).

## stdin {#stdin}

The default paste-back prompt writes to stderr and reads one line from stdin. Because a blocking read can't be
interrupted, it reads on one long-lived background thread: an abandoned prompt doesn't keep the runtime from
shutting down, but after a cancelled or timed-out paste-back, the next line typed on stdin is consumed by that
reader and handed to the next paste-back prompt, not to your app.

If your app reads stdin itself (a REPL, a TUI), or has no terminal (a GUI app), supply `Options::prompt_for_code`.

The nag helper treats the process as interactive only when stdout and stderr are both terminals; override it with
`Options::interactive`.

## TLS and proxies

HTTPS goes through `reqwest` 0.12 with `rustls`, so the crate doesn't link OpenSSL or need system libraries.

- **Root certificates:** the SDK's client trusts the Mozilla root set bundled into the binary (`webpki-roots`),
  not the operating system's certificate store. A proxy that intercepts TLS with a private CA isn't trusted. On a
  server, `server::verify_session_with` accepts your own `reqwest::Client`, which can use other roots.
- **Proxies:** `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY` and `NO_PROXY` (or their lowercase forms) are honoured.
  The system proxy settings of macOS and Windows aren't read.
- **User agent:** requests carry `sponsorkit-rust/<version>`.

## Supported Rust versions and targets

The minimum supported Rust version is 1.85, and CI tests both 1.85 and the latest stable release. The crate is written for native targets with a Tokio runtime (Linux,
macOS, Windows); it isn't designed for WebAssembly, where the [JavaScript SDK](../js/index.md) is the right choice.
