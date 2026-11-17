---
title: Sign-in in Go
description: Loopback and paste-back sign-in, how SignInAuto chooses between them, second identities, custom browsers and prompts, cancelling, and signing out.
sidebar_label: Sign-in
order: 20
---

Supporters sign in with the GitHub or Open Collective account they pay with. Sponsorkit runs the OAuth flow and
hands your program a session token, which the SDK stores locally. There is no password and no API key in your
program. [Sessions](../../concepts/sessions.md) explains the flow; this page covers the Go API.

```go title="main.go"
package main

import (
	"context"
	"fmt"
	"log"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	ctx := context.Background()
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", AppName: "my-cli"})
	if err != nil {
		log.Fatal(err)
	}
	if !sk.IsSignedIn() {
		fc, err := sk.SignIn(ctx)
		if err != nil {
			log.Fatal(err) // see "Errors" below
		}
		fmt.Println("Signed in as", fc.Supporter.ID, "with", len(fc.Active()), "active contribution(s)")
	}
}
```

`SignIn` never runs on its own: no other method signs anyone in, apart from `OpenCheckout`, which signs in first
when needed. Call it from a user action, such as a `login` or `sponsor` command. On success it stores the session
and returns a fresh `*Result`, so you don't need to call `GetFinancialContribution` afterwards.

## Choosing a flow

There are two native flows:

- **Loopback** (`SignInLoopback`): the SDK listens on `127.0.0.1` on a random port, opens the sign-in page in the
  system browser, and receives the one-time code on `http://127.0.0.1:<port>/callback` when the user is done.
  The browser tab then says it can be closed.
- **Paste-back** (`SignInPaste`): the SDK prints a URL to `Options.Stderr`. The user opens it on any device, signs
  in, and pastes the code the page shows; `PromptForCode` reads it (by default one line from stdin). It works
  over SSH, in containers and on machines without a browser. The code is valid for 10 minutes.

`SignInAuto`, the default, picks for you:

1. Paste-back when `SSH_CONNECTION` is set.
2. Paste-back on Linux and the BSDs when `DISPLAY` and `WAYLAND_DISPLAY` are both empty, unless you supplied your
   own `OpenBrowser`.
3. Otherwise loopback. If the browser can't be opened (`OpenBrowser` returns an error) or `127.0.0.1` can't be
   bound, it falls back to paste-back.

Force a flow for every call with `Options.SignInMethod`, or for one call:

```go
fc, err := sk.SignIn(ctx, sponsorkit.SignInOptions{Method: sponsorkit.SignInPaste})
```

A forced `SignInLoopback` doesn't fall back. If the browser fails to open it prints the URL to `Stderr` and keeps
waiting; if it can't listen on `127.0.0.1` it returns `network_error`.

## Custom browser and prompt

`OpenBrowser` defaults to `sponsorkit.OpenSystemBrowser`, which runs `xdg-open` (Linux, BSDs), `open` (macOS) or
`rundll32 url.dll,FileProtocolHandler` (Windows) without a shell. An opener that exits non-zero within 1.5 seconds
counts as a failure; one still running after that counts as opened.

Replace it to open a URL your own way, for example in a desktop app's web view, or to print it in your UI. It runs
concurrently with the loopback wait, so it may block; its context ends when the sign-in fails, is cancelled or
times out.

`PromptForCode` defaults to `sponsorkit.PromptStdin`, which writes `Sign-in code: ` to stderr and reads one line
from stdin. Replace it to ask in a GUI or to read from somewhere else. Returning an error, or an empty code, ends
the sign-in with `cancelled`.

```go title="main.go"
package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	in := bufio.NewReader(os.Stdin) // your program's own reader of stdin
	sk, err := sponsorkit.New(sponsorkit.Options{
		GitHub:       "octocat",
		AppName:      "my-cli",
		SignInMethod: sponsorkit.SignInPaste,
		OpenBrowser: func(ctx context.Context, url string) error {
			fmt.Println("Open this page to sign in:", url)
			return nil
		},
		PromptForCode: func(ctx context.Context, url string) (string, error) {
			fmt.Print("Paste the code: ")
			return in.ReadString('\n') // the SDK trims whitespace
		},
	})
	if err != nil {
		log.Fatal(err)
	}
	if _, err := sk.SignIn(context.Background()); err != nil {
		log.Fatal(err)
	}
}
```

:::warning[Reading stdin after a cancelled sign-in]
A blocking read of stdin can't be interrupted in Go. If a paste-back sign-in with the default `PromptStdin` is
cancelled or times out, its read stays pending, and the next line the user types goes to the next `PromptStdin`
call rather than to your program. If your program reads stdin itself, supply your own `PromptForCode` that shares
your reader, as above.
:::

## A second identity, and reconnecting

A supporter may pay on both GitHub and Open Collective. When your targets include both, calling `SignIn` while
signed in adds the second account to the same session ([why](../../concepts/sessions.md#a-second-identity)).
Name the provider to skip the picker:

```go
fc, err := sk.SignIn(ctx, sponsorkit.SignInOptions{Provider: sponsorkit.OpenCollective})
```

The provider must be one of your targets; otherwise `SignIn` returns `invalid_config`.

When a provider token expires or is revoked, that identity has `NeedsReconnect` set. Sign in with that provider
again to reconnect it:

```go title="main.go"
package main

import (
	"context"
	"fmt"
	"log"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	ctx := context.Background()
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", OpenCollective: "my-collective"})
	if err != nil {
		log.Fatal(err)
	}
	fc, err := sk.GetFinancialContribution(ctx)
	if err != nil {
		log.Fatal(err)
	}
	if fc.Supporter == nil {
		return
	}
	for _, id := range fc.Supporter.Identities {
		if id.NeedsReconnect {
			fmt.Printf("Your %s connection expired; reconnecting…\n", id.Provider)
			if _, err := sk.SignIn(ctx, sponsorkit.SignInOptions{Provider: id.Provider}); err != nil {
				log.Println(err)
			}
		}
	}
}
```

If the stored session itself has died by the time the user finishes adding an identity, the SDK clears it and
completes the sign-in as a fresh session instead.

## Timeouts and cancellation

The wait for the user is bounded two ways:

- **`Options.SignInTimeout`** (5 minutes by default). When it elapses, `SignIn` returns `timeout`.
- **The `ctx` you pass.** Cancel it, for example on Ctrl+C with `signal.NotifyContext`, and `SignIn` returns
  `cancelled`. The error wraps the context's error, so `errors.Is(err, context.Canceled)` is true too.

```go title="main.go"
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", AppName: "my-cli"})
	if err != nil {
		log.Fatal(err)
	}
	_, err = sk.SignIn(ctx)
	switch sponsorkit.ErrorCodeOf(err) {
	case "":
		fmt.Println("Signed in.")
	case sponsorkit.CodeCancelled, sponsorkit.CodeTimeout:
		fmt.Println("Sign-in abandoned; run `my-cli login` to try again.")
	case sponsorkit.CodeAccessDenied:
		fmt.Println("You declined access, so nothing changed.")
	case sponsorkit.CodeNetworkError:
		var skErr *sponsorkit.Error
		if errors.As(err, &skErr) && skErr.RetryAfter != nil {
			fmt.Println("Sponsorkit is busy; try again in", *skErr.RetryAfter)
		} else {
			fmt.Println("Couldn't reach Sponsorkit; check your connection.")
		}
	default:
		log.Fatal(err)
	}
}
```

The timeout covers only the wait for the user. The code exchange that follows is a normal API request, bounded by
`RequestTimeout`.

## Errors

| Code | When |
|---|---|
| `disabled` | `SPONSORKIT_DISABLE` is set. |
| `invalid_config` | The provider in `SignInOptions` isn't one of your targets, the dev-time check failed, or the session couldn't be written to storage. |
| `access_denied`, `invalid_state`, `provider_error` | Reported by the sign-in page: the user declined, the sign-in expired, or the provider failed. |
| `invalid_code` | The API rejected the code exchange: the code was malformed or expired, or didn't match the PKCE verifier. |
| `cancelled` | `ctx` was cancelled, or the paste-back prompt returned an error or an empty code. |
| `timeout` | `SignInTimeout` elapsed. |
| `network_error` | Sponsorkit couldn't be reached, or answered 5xx, 429 or something unexpected. `RetryAfter` is set when it sent `Retry-After`. |

See [Errors and cancellation](errors.md) for handling them in general.

## Session token and signing out

- `IsSignedIn()` reports whether a session token is stored. It makes no request.
- `SessionToken()` returns the stored `sks_…` token so you can [send it to your backend](backend-verification.md).
  It returns `""` when signed out, disabled or in mock mode. Treat it like a password.
- `SignOut(ctx)` deletes the token and cached result locally; nag state is kept. There is no server-side sign-out:
  the session simply stops being used. It returns `invalid_config` only if the storage can't be written.

The session lives in a file in the per-user config directory (see
[platform notes](platform-notes.md#where-state-is-stored)), so a user who signed in once stays signed in across
runs. When the API renews a session token, the SDK stores the new one automatically.
