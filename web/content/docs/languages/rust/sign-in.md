---
title: Sign-in in Rust
description: How Sponsorkit::sign_in signs supporters in with loopback or paste-back, how Auto picks between them, and how to bound, cancel and customize a sign-in.
sidebar_label: Sign-in
order: 20
---

Supporters sign in with the GitHub or Open Collective account they pay with. Sponsorkit runs the OAuth flow and
gives the SDK a session token, which it stores locally and uses for every later check. Sign-in only happens when
you call `sign_in` (or `open_checkout` for a signed-out user); nothing in the SDK signs anyone in implicitly. The
concepts behind it are in [sign-in & sessions](../../concepts/sessions.md).

```rust title="src/main.rs"
use sponsorkit::{ErrorCode, Options, SignInOptions, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options { github: Some("octocat".into()), app_name: Some("my-cli".into()), ..Default::default() })?;

    match sk.sign_in(SignInOptions::default()).await {
        Ok(fc) => {
            let who = fc.supporter.as_ref().and_then(|s| s.identities.first()).and_then(|i| i.handle.clone());
            println!("Signed in as {}.", who.unwrap_or_else(|| "a supporter".into()));
        }
        Err(e) => match e.code() {
            ErrorCode::AccessDenied | ErrorCode::Cancelled => println!("No problem, maybe later."),
            ErrorCode::Timeout => println!("Sign-in took too long. Run `my-cli login` to try again."),
            _ => return Err(e),
        },
    }
    Ok(())
}
```

`sign_in` returns the fresh [`ContributionResult`](contributions.md) for the new session, and stores the session
token and that result in the [state file](platform-notes.md#where-state-is-kept), so the next
`get_financial_contribution` is served from the cache.

## The two flows

| Method | Used when | What the user sees |
|---|---|---|
| Loopback | A desktop session with a browser | The SDK listens on `http://127.0.0.1:<random port>/callback` and opens the system browser on the consent page. After approval the browser is sent back to that port and shows a "you can close this window" page. |
| Paste-back | SSH, containers, servers without a display | The SDK prints a link to stderr and asks for a code. The user opens the link on any device, approves, and pastes the code shown back into the terminal. |

Both use PKCE: the code is useless without a secret only this process holds.

The paste-back prompt looks like this on stderr:

```text
To sign in with Sponsorkit, open this URL in a browser on any device:

  https://sponsorkit.github.io/sponsorkit.io/connect/?targets=github%3Aoctocat&challenge=…&delivery=paste&app_name=my-cli

Then paste the code shown on the page here:
```

### How `Auto` chooses

`SignInMethod::Auto` (the default) picks paste-back up front when you haven't set an `open_browser` hook and
there's no display:

- `SSH_CONNECTION` or `SSH_TTY` is set, or
- on Linux and other Unix systems (not macOS or Windows), neither `DISPLAY` nor `WAYLAND_DISPLAY` is set.

Otherwise it tries loopback, and falls back to paste-back if `127.0.0.1` can't be bound or the browser can't be
opened. The system browser is opened with `open` on macOS, `rundll32 url.dll,FileProtocolHandler` on Windows and
`xdg-open` elsewhere; the launch counts as failed only if the launcher exits with an error within 1.5 seconds.
One that's still running is assumed to be opening the browser.

Force a flow with `Options::sign_in_method` or, for one call, `SignInOptions::method`:

| `SignInMethod` | Behaviour |
|---|---|
| `Auto` | As above. |
| `Loopback` | Always loopback. If the browser can't be opened, the SDK prints the URL to stderr and keeps waiting, so the user can open it on the same machine. |
| `Paste` | Always paste-back. Use it for tools that usually run over SSH, or let users pick with a `--paste` flag. |

## `SignInOptions`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `provider` | `Option<Provider>` | `None`: the page asks | Skips the provider picker. Must be one of your targets' providers, or `sign_in` fails with `invalid_config`. |
| `method` | `Option<SignInMethod>` | the instance's `sign_in_method` | Overrides the flow for this call. |
| `cancel` | `Option<CancellationToken>` | `None` | Cancels a pending sign-in; it then fails with `cancelled`. See [cancelling](#timeouts-and-cancellation). |

## A second identity

When a supporter is already signed in, `sign_in` **adds** an identity to the session instead of replacing it.
That's how someone who sponsors you on GitHub and backs you on Open Collective gets both counted. Pass `provider`
to skip the picker:

```rust title="src/main.rs"
use sponsorkit::{GetOptions, Options, Provider, SignInOptions, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        opencollective: Some("my-collective".into()),
        ..Default::default()
    })?;

    let fc = sk.get_financial_contribution(GetOptions::default()).await?;
    let identities = fc.supporter.as_ref().map(|s| s.identities.as_slice()).unwrap_or_default();

    // Connect Open Collective too, if the session only has GitHub.
    if fc.signed_in && !identities.iter().any(|i| i.provider == Provider::OpenCollective) {
        sk.sign_in(SignInOptions { provider: Some(Provider::OpenCollective), ..Default::default() }).await?;
    }

    // Reconnect an identity whose provider sign-in expired.
    for identity in identities.iter().filter(|i| i.needs_reconnect) {
        eprintln!("Your {} sign-in expired; reconnecting...", identity.provider);
        sk.sign_in(SignInOptions { provider: Some(identity.provider), ..Default::default() }).await?;
    }
    Ok(())
}
```

`Identity::needs_reconnect` is `true` when the provider's own authorization expired or was revoked; that
provider's contributions are missing until the user signs in with it again. If the stored session turns out to
be dead when adding an identity, the SDK clears it and starts a new session with the same sign-in, so the user
doesn't have to go through it twice. More in [a second identity](../../concepts/sessions.md#a-second-identity).

## Timeouts and cancellation

A sign-in waits for a person, so it's bounded three ways:

- **`Options::sign_in_timeout`** (default 300 seconds) covers the whole wait for the loopback callback or the
  pasted code. Exceeding it fails with `ErrorCode::Timeout`.
- **`SignInOptions::cancel`** takes a [`CancellationToken`](errors.md#cancellation). Cancelling fails with
  `ErrorCode::Cancelled`. An empty line at the paste-back prompt (or end of input) is also `cancelled`.
- **Dropping the future**, for example through `tokio::time::timeout` or a `tokio::select!` branch, stops the
  sign-in and its loopback listener without a result.

```rust title="src/main.rs"
use sponsorkit::{CancellationToken, ErrorCode, Options, SignInOptions, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options { github: Some("octocat".into()), ..Default::default() })?;

    // Cancel the sign-in when the user presses Ctrl+C (needs tokio's "signal" feature).
    let cancel = CancellationToken::new();
    let on_ctrl_c = cancel.clone();
    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            on_ctrl_c.cancel();
        }
    });

    match sk.sign_in(SignInOptions { cancel: Some(cancel), ..Default::default() }).await {
        Ok(_) => println!("Signed in."),
        Err(e) if e.code() == ErrorCode::Cancelled => println!("Sign-in cancelled."),
        Err(e) => return Err(e),
    }
    Ok(())
}
```

:::warning[Paste-back and stdin]
A blocking read from stdin can't be interrupted, so the default paste-back prompt reads stdin on one long-lived
background thread. After a cancelled or timed-out paste-back, the next line the user types is consumed by that
reader (and handed to the next paste-back prompt), not by your app. If your app reads stdin itself, supply
`prompt_for_code` as shown below.
:::

## Custom browser and prompt

Two hooks on `Options` replace the parts of sign-in that touch the user's machine. Use them to show the link in
your own UI, read the code from your own input loop, or drive sign-in in tests.

```rust title="src/main.rs"
use std::sync::Arc;

use sponsorkit::{OpenBrowserHook, Options, PromptForCodeHook, SignInMethod, Sponsorkit};

fn main() -> Result<(), sponsorkit::Error> {
    // Show the link in your own UI instead of launching the system browser.
    let open_browser: OpenBrowserHook = Arc::new(|url: String| {
        Box::pin(async move {
            println!("Open this page to sign in: {url}");
            Ok(())
        })
    });

    // Read the paste-back code your own way (here: a line from stdin on a blocking thread).
    let prompt_for_code: PromptForCodeHook = Arc::new(|url: String| {
        Box::pin(async move {
            println!("Open {url} on any device, then type the code it shows:");
            tokio::task::spawn_blocking(|| {
                let mut line = String::new();
                std::io::stdin().read_line(&mut line).map(|_| line)
            })
            .await
            .map_err(std::io::Error::other)?
        })
    });

    let _sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        sign_in_method: SignInMethod::Auto,
        open_browser: Some(open_browser),
        prompt_for_code: Some(prompt_for_code),
        ..Default::default()
    })?;
    Ok(())
}
```

- **`open_browser`** receives the URL to open. Return `Err` when it can't be opened: with `Auto`, the SDK then
  falls back to paste-back. With a hook set, `Auto` skips the display check and lets your hook decide. The
  loopback callback is accepted even while your hook's future is still running.
- **`prompt_for_code`** receives the paste-back URL (the SDK has already printed it to stderr) and returns the
  code the user typed. Surrounding whitespace is trimmed; an empty code fails with `cancelled`, and an `Err`
  from the hook fails with `cancelled` too.

## Errors

| Code | When |
|---|---|
| `access_denied` | The user declined on the provider's consent screen. |
| `invalid_state`, `provider_error` | The sign-in page reported a problem with the OAuth state or the provider. |
| `invalid_code` | The API rejected the code, for example a mistyped paste-back code. |
| `cancelled` | `SignInOptions::cancel` fired, nothing was entered at the paste-back prompt, or the prompt failed. |
| `timeout` | `sign_in_timeout` passed. |
| `network_error` | The API couldn't be reached, timed out, or answered 5xx, 429 or something unexpected. `e.retry_after()` has the API's `Retry-After`, if it sent one. |
| `disabled` | `SPONSORKIT_DISABLE` is set. |
| `invalid_config` | `provider` isn't one of your targets, the [dev-time check](configuration.md#the-dev-time-target-check) failed, or the state file couldn't be written. |

See [errors and cancellation](errors.md) for handling them.

## Mock mode

With `Options::mock` or `SPONSORKIT_MOCK`, `sign_in` returns at once without a browser and signs the instance in.
If it was signed out, its contributions become empty. See [testing](testing.md#mock-mode).

## Signing out

```rust
sk.sign_out().await?;
```

`sign_out` deletes the session token and the cached result on this machine and keeps nag state. It doesn't
call the API, and it's a no-op when the SDK is disabled. It fails with `invalid_config` only if the state file
can't be written.

`sk.is_signed_in()` tells you whether a session token is stored. It reads local storage only and never touches
the network, so it's fine for deciding whether to show a "Sign in" or "Sign out" button.
