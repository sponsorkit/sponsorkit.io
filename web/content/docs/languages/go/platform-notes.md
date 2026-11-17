---
title: Go platform notes
description: Contexts and goroutines, where the SDK stores its state on each OS, how it opens the browser and reads stdin, HTTP clients and proxies, and per-process state.
sidebar_label: Platform notes
order: 90
---

## Contexts, goroutines and concurrency

- **`context.Context` everywhere I/O happens.** `GetFinancialContribution`, `SignIn`, `SignOut`, `OpenCheckout`,
  `Nag.Due` and `VerifySession` take a context as their first argument. Cancel it to stop waiting; see
  [cancellation](errors.md#cancellation) for what each method returns. Methods without one
  (`New`, `CheckoutURL`, `IsSignedIn`, `SessionToken`, `Targets`) do no network I/O.
- **Blocking calls, no callbacks.** Every method returns when its work is done. `SignIn` and `OpenCheckout` can
  block for minutes while the user is in the browser, so run them from a command handler, or in a goroutine if
  your program has an event loop or a UI.
- **Safe for concurrent use.** One `*Client` can be shared by goroutines. Create it once (it does no I/O) and
  reuse it. Updates to the state file are serialized within the process, and every write replaces the file
  atomically.
- **Goroutines the SDK starts** end with the call that started them (the loopback HTTP server, the browser
  opener), with two exceptions: the default paste-back prompt's read of stdin (see [stdin](#reading-stdin)) and,
  after a successful sign-in, the `OpenBrowser` call. Its `ctx` is not cancelled on success, so the browser can
  follow the redirect; `OpenSystemBrowser` likewise leaves a goroutine waiting on an opener process that is
  still running after 1.5 seconds.

## Where state is stored

The SDK keeps one small JSON file per target set: the session token, the cached result and nag state. Its name is
`<targets_hash>.json`, where `targets_hash` is `sponsorkit.TargetsHash(targets)`. The format is
[the same in every SDK](../../reference-http/protocol.md#storage-format).

| OS | Default directory (`sponsorkit.DefaultStorageDir()`) |
|---|---|
| Linux, BSDs | `$XDG_CONFIG_HOME/sponsorkit`, or `~/.config/sponsorkit` |
| macOS | `~/Library/Application Support/sponsorkit` |
| Windows | `%AppData%\sponsorkit` |

- The directory is created with mode `0700` and the file with `0600`. Writes go to a temporary file that is
  renamed over the old one, so a crash never leaves a half-written file.
- Reading never fails: a file that can't be parsed reads as empty, and a malformed part (say, a bad cache entry)
  reads as absent while the rest is kept.
- If there is no usable per-user config directory (`os.UserConfigDir` fails, for example because `HOME` is unset,
  or returns a relative path), state is kept in process memory instead. `New` still succeeds; the user simply has
  to sign in again in the next process. Nothing is ever written relative to the working directory.
- `Options.StorageDir` moves the file; `Options.Storage` replaces file storage entirely. A `Storage` gets the
  `targets_hash` as its key and the whole document as bytes, and must be safe for concurrent use:

```go title="storage.go"
package main

import sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"

// keychain is a sketch of a Storage backed by the OS credential store.
type keychain struct{ service string }

func (k keychain) Read(key string) ([]byte, error) {
	// Return (nil, nil) when nothing is stored.
	return nil, nil
}

func (k keychain) Write(key string, data []byte) error {
	// Replace the stored document atomically.
	return nil
}

var _ sponsorkit.Storage = keychain{}
```

`SignOut` deletes the token and the cache but keeps nag state. To remove everything, delete the file.

## Opening the browser

The default `OpenBrowser`, `sponsorkit.OpenSystemBrowser`, starts the platform's opener directly, never through a
shell, so a URL can't inject commands:

| OS | Command |
|---|---|
| Linux, BSDs | `xdg-open <url>` |
| macOS | `open <url>` |
| Windows | `rundll32 url.dll,FileProtocolHandler <url>` |

It waits up to 1.5 seconds: an opener that exits with an error in that time (say, `xdg-open` with no browser
installed) is a failure, which makes `SignInAuto` fall back to paste-back. Inside a desktop app, pass your own
`OpenBrowser`.

## Reading stdin

`sponsorkit.PromptStdin`, the default paste-back prompt, reads stdin one byte at a time up to the end of the line,
so it never consumes input meant for your program. A read from stdin can't be interrupted in Go, though: when a
paste-back sign-in is cancelled or times out, the read stays in flight, and the next line typed is handed to the
next `PromptStdin` call. If your program reads stdin itself after a cancelled sign-in, supply your own
`PromptForCode` ([example](sign-in.md#custom-browser-and-prompt)).

## HTTP clients and proxies

All API requests go through `Options.HTTPClient` (or `WithHTTPClient` for `VerifySession`). The default,
`&http.Client{}`, uses `http.DefaultTransport`, which honours `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` and the
system's root certificates. Pass your own client for custom TLS settings, tracing or a corporate proxy;
`RequestTimeout` still bounds each request. Requests carry the `User-Agent` `sponsorkit-go/<version>`.

## Per-process state

A few things are remembered per process rather than in the state file, as the
[protocol](../../reference-http/protocol.md) requires:

- which nags were already counted this run (so a nag counts one run per process, however often you call `Due`),
- the result of the dev-time target check,
- an active `Retry-After` from the API.

They are shared by all clients in the process. `sponsorkit.ResetProcessState()` forgets them, for tests that
simulate a new process.

## Building and distributing

The SDK is pure Go with no cgo, so `CGO_ENABLED=0` builds and cross-compilation (`GOOS=windows GOARCH=arm64 go
build`) work as usual, and static binaries need nothing extra at run time except a way to open a browser. The
mock presets are embedded with `go:embed`, so no data files ship alongside your binary.

Users of your program can turn Sponsorkit off with `SPONSORKIT_DISABLE=1` or silence nags with
`SPONSORKIT_NO_NAG=1`; consider mentioning both in your `--help` or README.
