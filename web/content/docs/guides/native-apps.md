---
title: Use Sponsorkit in a CLI or desktop app
description: Sign people in from a terminal or desktop app with loopback or paste-back, and handle timeouts and cancellation.
order: 30
---

Native apps can't receive a popup message, so they sign people in through the system browser instead. You still
don't register anything: the SDK picks a delivery method that proves the code reached the app that asked for it.

In JavaScript, use the `@sponsorkit/sdk/node` entry point (Node.js 20+, Bun, Deno). The .NET, Python, Go and Rust
SDKs are native by default.

## Name your app

Set `appName`. The consent page can't verify a native app's identity, so it shows the name labelled "says it is",
next to the accounts that will be checked. Without it, people see a sign-in request with no app name at all.

:::tabs
```ts title="sponsorkit.ts"
import { Sponsorkit } from "@sponsorkit/sdk/node";

export const sk = new Sponsorkit({ github: "octocat", appName: "my-cli" });
```
```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", AppName = "my-cli" });
Console.WriteLine(string.Join(", ", sk.Targets));
```
```python title="sponsor.py"
from sponsorkit import Sponsorkit

sk = Sponsorkit(github="octocat", app_name="my-cli")
```
```go title="main.go"
package main

import (
	"fmt"
	"log"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", AppName: "my-cli"})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(sk.Targets())
}
```
```rust title="main.rs"
use sponsorkit::{Options, Sponsorkit};

fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        app_name: Some("my-cli".into()),
        ..Default::default()
    })?;
    println!("{}", sk.targets().param());
    Ok(())
}
```
:::

The name is at most 64 characters.

## Loopback and paste-back

There are two sign-in flows. By default (`signInMethod: "auto"`) the SDK chooses for you.

**Loopback** is used on a machine with a desktop:

1. The SDK listens on `http://127.0.0.1:<random port>/callback`.
2. It opens the consent page in the system browser.
3. After consent, the browser is redirected to that local address with the sign-in code, and shows "You can
   close this window".
4. The SDK exchanges the code (with its PKCE verifier) for a session.

**Paste-back** is used when there's no browser on this machine, for example over SSH or in a container:

1. The SDK prints a `https://sponsorkit.io/connect?…&delivery=paste` URL to stderr.
2. The person opens it on any device, such as their laptop or phone.
3. After consent, the page shows a code with a copy button. It's valid for 10 minutes.
4. The person pastes it into the terminal, and the SDK exchanges it.

`auto` picks paste-back up front when it detects an SSH session or a machine without a display. The SDKs
differ slightly in what they check:

| SDK | SSH session | No display (neither `DISPLAY` nor `WAYLAND_DISPLAY` is set) |
|---|---|---|
| JavaScript (Node, Bun, Deno) | `SSH_CONNECTION` or `SSH_TTY` | Checked on Linux only |
| .NET | `SSH_CONNECTION` | Checked on every OS except Windows and macOS (Linux, BSD, …) |
| Python | `SSH_CONNECTION` or `SSH_TTY` | Checked on every OS except Windows, macOS and Cygwin |
| Go | `SSH_CONNECTION` | Checked on every OS except Windows and macOS |
| Rust | `SSH_CONNECTION` or `SSH_TTY` | Checked on every OS except Windows and macOS |

In .NET, Python and Rust, passing your own `openBrowser` skips this detection entirely; in Go it skips only the
display check, and in JavaScript it skips neither. Where the up-front check doesn't apply, for example on a
headless FreeBSD machine with the JavaScript SDK, `auto` still falls back to paste-back when the browser can't
be opened or the local port can't be bound. A code from either flow is useless without the verifier that only
your process holds, so it doesn't matter who sees it.

To force a flow, set `signInMethod` (`SignInMethod` in .NET and Go, `sign_in_method` in Python and Rust) to
`"loopback"` or `"paste"`, or pass a method to a single sign-in call.

## A `login` command with timeout and cancellation

A sign-in waits for a person, so it needs an upper bound and a way out:

- **Timeout.** `signInTimeout` (300 seconds by default) bounds how long sign-in waits for the browser or the
  pasted code. When it runs out, sign-in fails with `timeout`.
- **Cancellation.** Each SDK takes its platform's cancellation primitive. A cancelled sign-in fails with
  `cancelled`, and the local listener is shut down.

This `login` command uses a two-minute timeout and cancels on Ctrl+C:

:::tabs
```ts title="login.ts"
import { Sponsorkit, isSponsorkitError } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({ github: "octocat", appName: "my-cli", signInTimeout: 120 });

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());

try {
  const fc = await sk.signIn({ signal: controller.signal });
  console.log(fc.active().length > 0 ? "Thanks for sponsoring my-cli!" : "Signed in.");
} catch (e) {
  if (isSponsorkitError(e, "cancelled")) console.error("Sign-in cancelled.");
  else if (isSponsorkitError(e, "timeout")) console.error("Sign-in timed out. Run `my-cli login` to try again.");
  else if (isSponsorkitError(e)) console.error(`Sign-in failed: ${e.code}`);
  else throw e;
  process.exitCode = 1;
}
```
```csharp title="Login.cs"
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
    Console.WriteLine(fc.Active().Count > 0 ? "Thanks for sponsoring my-cli!" : "Signed in.");
}
catch (SponsorkitError e)
{
    Console.Error.WriteLine(e.Code switch
    {
        SponsorkitErrorCodes.Cancelled => "Sign-in cancelled.",
        SponsorkitErrorCodes.Timeout => "Sign-in timed out. Run `my-cli login` to try again.",
        _ => $"Sign-in failed: {e.Code}",
    });
    return 1;
}
return 0;
```
```python title="login.py"
import sys
import threading

from sponsorkit import Sponsorkit, SponsorkitError

sk = Sponsorkit(github="octocat", app_name="my-cli", sign_in_timeout=120)

# Call cancel.set() from another thread (a GUI "Cancel" button, a signal handler...)
# to abandon the sign-in.
cancel = threading.Event()

try:
    fc = sk.sign_in(cancel=cancel)
    print("Thanks for sponsoring my-cli!" if fc.active() else "Signed in.")
except SponsorkitError as e:
    if e.code == "cancelled":
        print("Sign-in cancelled.", file=sys.stderr)
    elif e.code == "timeout":
        print("Sign-in timed out. Run `my-cli login` to try again.", file=sys.stderr)
    else:
        print(f"Sign-in failed: {e.code}", file=sys.stderr)
    sys.exit(1)
```
```go title="login.go"
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	sk, err := sponsorkit.New(sponsorkit.Options{
		GitHub:        "octocat",
		AppName:       "my-cli",
		SignInTimeout: 2 * time.Minute,
	})
	if err != nil {
		log.Fatal(err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	fc, err := sk.SignIn(ctx)
	switch sponsorkit.ErrorCodeOf(err) {
	case "":
		if len(fc.Active()) > 0 {
			fmt.Println("Thanks for sponsoring my-cli!")
		} else {
			fmt.Println("Signed in.")
		}
	case sponsorkit.CodeCancelled:
		fmt.Fprintln(os.Stderr, "Sign-in cancelled.")
		os.Exit(1)
	case sponsorkit.CodeTimeout:
		fmt.Fprintln(os.Stderr, "Sign-in timed out. Run `my-cli login` to try again.")
		os.Exit(1)
	default:
		fmt.Fprintln(os.Stderr, "Sign-in failed:", err)
		os.Exit(1)
	}
}
```
```rust title="login.rs"
use std::time::Duration;

use sponsorkit::{CancellationToken, ErrorCode, Options, SignInOptions, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        app_name: Some("my-cli".into()),
        sign_in_timeout: Some(Duration::from_secs(120)),
        ..Default::default()
    })?;

    // Needs tokio's "signal" feature.
    let cancel = CancellationToken::new();
    let on_ctrl_c = cancel.clone();
    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.ok();
        on_ctrl_c.cancel();
    });

    match sk.sign_in(SignInOptions { cancel: Some(cancel), ..Default::default() }).await {
        Ok(fc) if !fc.active().is_empty() => println!("Thanks for sponsoring my-cli!"),
        Ok(_) => println!("Signed in."),
        Err(e) => {
            match e.code() {
                ErrorCode::Cancelled => eprintln!("Sign-in cancelled."),
                ErrorCode::Timeout => eprintln!("Sign-in timed out. Run `my-cli login` to try again."),
                _ => eprintln!("Sign-in failed: {e}"),
            }
            std::process::exit(1);
        }
    }
    Ok(())
}
```
:::

Python's async variants (`asign_in`, `aopen_checkout`) also stop when the awaiting task is cancelled. In Rust,
dropping the future (for example with `tokio::time::timeout`) stops everything too, but yields no result.

Signing in while already signed in **adds** an identity: pass a provider (`{ provider: "opencollective" }`) to
connect a second account to the same session. The same call reconnects an identity flagged `needsReconnect`.
See [Sessions](../concepts/sessions.md).

## Reading the pasted code yourself

The default paste-back prompt reads one line from stdin. A blocking read of stdin can't be interrupted, so after a
cancelled or timed-out paste-back that read stays pending, and the next line the person types goes to Sponsorkit
instead of your app. If your app reads stdin itself (a REPL, an interactive prompt library), supply your own
prompt with `promptForCode` (`PromptForCode` in .NET and Go, `prompt_for_code` in Python and Rust). It receives
the URL to open and returns the code. An empty answer cancels the sign-in.

Desktop apps with a GUI can use the same hook to show a text field instead of reading stdin, and `openBrowser`
(`OpenBrowser`, `open_browser`) to open the URL their own way.

## Where state is kept

The session token, the cached result and nag counters live in one JSON file per set of targets, named
`<targets_hash>.json`, in a per-user directory:

| OS | Directory |
|---|---|
| Linux | `$XDG_CONFIG_HOME/sponsorkit`, or `~/.config/sponsorkit` |
| macOS | `~/Library/Application Support/sponsorkit` |
| Windows | `%APPDATA%\sponsorkit` |

The directory is created with mode `0700` and files with `0600`, and writes are atomic. All five SDKs use the same
format, so a person who signs in through your Python tool is also signed in to your Go tool with the same targets.
If no per-user directory can be found (for example `HOME` is unset), state is kept in memory and nothing is
written to the working directory.

Change the directory with `storageDir` (`StorageDirectory` in .NET, `StorageDir` in Go, `storage_dir` in Python
and Rust). The JavaScript, .NET, Python and Go SDKs also accept your own backend as `storage`, for example one
backed by the OS keychain. `signOut()`
deletes the token and the cache from this file and keeps nag state.
