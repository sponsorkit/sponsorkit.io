---
title: Sign-in in Python
description: How supporters sign in from a Python program with loopback or paste-back, how to add a second identity, and how to time out or cancel a sign-in.
sidebar_label: Sign-in
order: 20
---

Supporters sign in with the GitHub or Open Collective account they pay with. Sponsorkit runs the OAuth flow and
hands your program a session token bound to your targets; the provider's own token never reaches your program.
The client stores the session token and uses it for every later `get_financial_contribution()` call, for up to
180 days while it's being used. Background: [Sessions](/docs/concepts/sessions).

```python
fc = sk.sign_in()  # returns the fresh ContributionResult, which is also cached
```

Call `sign_in()` only from something the user chose to do, such as a `login` command or a menu item. Nothing in
the SDK signs anyone in on its own, not even the [nag helper](nag.md).

## Loopback and paste-back

Python programs run on someone's computer, so there is no popup. The consent page opens in a browser, and the
one-time code gets back to your program one of two ways:

| Method | How it works | Where it's used |
|---|---|---|
| Loopback | The client listens on `http://127.0.0.1:<random port>/callback`, opens the system browser on the consent page, and receives the code when the browser is redirected back. The page then says "You can close this window". | Desktops and laptops. |
| Paste-back | The client prints a link to standard error and asks for a code. The person opens the link on any device, approves, and pastes the code shown there. The code is valid for 10 minutes. | SSH sessions, containers, servers without a display. |

Either way the client then exchanges the code (protected by PKCE, so a stolen code is useless) for a session
token and stores it.

### Choosing a method

`sign_in_method="auto"` (the default) picks for you:

1. **Paste-back** when `SSH_CONNECTION` or `SSH_TTY` is set, or on Linux and other Unix systems when neither
   `DISPLAY` nor `WAYLAND_DISPLAY` is set.
2. Otherwise **loopback**, falling back to paste-back when the listener can't bind to `127.0.0.1` or the browser
   can't be opened.

When you pass your own `open_browser`, the SSH and display checks are skipped: your opener decides, and
returning `False` still falls back to paste-back.

Force a method for every sign-in with the `sign_in_method` option, or for one call with `method`:

```python
sk.sign_in(method="paste")      # always print a link and ask for the code
sk.sign_in(method="loopback")   # never fall back to paste-back
```

With `"loopback"`, a listener that can't bind raises `provider_error`, and a browser that can't be opened
prints the URL to standard error so the person can open it themselves; the client keeps waiting either way
until the timeout.

## Name your app

The consent page shows who is asking. A web page has an origin to show; a native program doesn't, so pass
`app_name` and the page shows it as "*my-cli* says it is…". Anything running on the person's computer could
claim any name, which is why it's labelled that way. See [Security](/docs/concepts/security).

```python
sk = Sponsorkit(github="octocat", app_name="my-cli")
```

## Choosing a provider and adding identities

Without arguments, the consent page lets the person choose GitHub or Open Collective (when you configured both).
Pass a provider to skip the choice. Signing in again while signed in **adds** that identity to the same session,
so someone who sponsors you on GitHub and backed your collective sees both. The same call reconnects an identity
whose provider sign-in expired:

```python title="identities.py"
from sponsorkit import Sponsorkit

sk = Sponsorkit(github="octocat", opencollective="my-collective", app_name="my-cli")

fc = sk.sign_in("github")  # skip the provider picker
fc = sk.sign_in("opencollective")  # adds a second identity to the same session

if fc.supporter is not None:
    for identity in fc.supporter.identities:
        if identity.needs_reconnect:
            sk.sign_in(identity.provider)  # reconnects that provider
```

The provider must be one of your configured targets; anything else raises `invalid_config`. See
[A second identity](/docs/concepts/sessions#a-second-identity).

## Timeouts and cancellation

A sign-in waits for a person, so it needs an end:

- **Timeout.** It raises `SponsorkitError("timeout")` after `sign_in_timeout` seconds (300 by default). Pass
  `timeout=` (a finite positive number of seconds) to override it for one call; the error message names the
  limit that applied.
- **Cancellation.** Pass a `threading.Event` as `cancel` and set it from anywhere (another thread, a signal
  handler, a GUI "Cancel" button). The sign-in raises `SponsorkitError("cancelled")` within about 50 ms. An
  empty answer at the paste-back prompt cancels too.

```python title="login.py"
import signal
import threading

from sponsorkit import Sponsorkit, SponsorkitError

sk = Sponsorkit(github="octocat", app_name="my-cli")
cancel = threading.Event()

# Ctrl+C cancels the sign-in instead of killing the program with a traceback.
signal.signal(signal.SIGINT, lambda signum, frame: cancel.set())

try:
    fc = sk.sign_in(timeout=120, cancel=cancel)
    print(f"Signed in. {len(fc.active())} active contribution(s).")
except SponsorkitError as e:
    if e.code == "cancelled":
        print("Sign-in cancelled.")
    elif e.code == "timeout":
        print("Sign-in timed out; run `my-cli login` to try again.")
    else:
        raise
finally:
    signal.signal(signal.SIGINT, signal.default_int_handler)
```

### With asyncio

`asign_in()` accepts an `asyncio.Event` or a `threading.Event` as `cancel`. Cancelling the task that awaits it
also stops the sign-in; then `asyncio.CancelledError` propagates as usual instead of a `SponsorkitError`.

```python title="login_async.py"
import asyncio

from sponsorkit import Sponsorkit, SponsorkitError


async def login(sk: Sponsorkit, stop: asyncio.Event) -> None:
    try:
        fc = await sk.asign_in(cancel=stop)  # an asyncio.Event or a threading.Event
        print(f"Signed in as {fc.supporter.id if fc.supporter else '?'}")
    except SponsorkitError as e:
        print(f"Sign-in ended: {e.code}")


async def main() -> None:
    sk = Sponsorkit(github="octocat", app_name="my-app")
    stop = asyncio.Event()
    task = asyncio.create_task(login(sk, stop))
    await asyncio.sleep(30)
    stop.set()  # or: task.cancel(), which raises CancelledError in the task
    await task


asyncio.run(main())
```

## Custom browser and prompt

Two hooks let a desktop app or a terminal UI take over the visible parts of sign-in:

- `open_browser(url)` opens the consent page. Return `False` or raise when it couldn't; with `auto`, the client
  then falls back to paste-back. It runs in a helper thread, and the loopback callback is accepted while it is
  still running.
- `prompt_for_code(url)` shows the paste-back URL and returns the code the person entered. Return an empty
  string to cancel.

```python title="hooks.py"
import webbrowser

from sponsorkit import Sponsorkit


def open_browser(url: str) -> bool:
    # Return False (or raise) when the browser could not be opened; "auto" then falls back to paste-back.
    return webbrowser.open(url)


def prompt_for_code(url: str) -> str:
    # Show the URL however your app likes, then return what the user pasted.
    # Returning an empty string cancels the sign-in.
    print(f"Open {url} and paste the code here.")
    return input("Code: ")


sk = Sponsorkit(
    github="octocat",
    app_name="my-app",
    open_browser=open_browser,
    prompt_for_code=prompt_for_code,
)
sk.sign_in(method="paste")
```

:::warning[Programs that read standard input]
The default prompt reads one line from stdin, and a blocking read can't be interrupted. After a paste-back that
timed out or was cancelled, that read is still pending, so the next line the person types goes to it instead of
your program. If your program reads stdin itself (a REPL, a prompt library), pass your own `prompt_for_code`.
:::

## Checking and ending the session

```python
sk.is_signed_in()  # True when a session token is stored; no network access
sk.sign_out()      # deletes the stored token and cached result; nag counters are kept
```

`sign_out()` only forgets the session on this machine; the person can also revoke Sponsorkit at GitHub or Open
Collective. It raises `invalid_config` if the state file can't be updated, for example because the directory
is read-only. If the API later rejects a stored session (expired or revoked), the next
`get_financial_contribution()` clears it and returns a signed-out result, so you never have to handle that case
yourself.

## Errors

`sign_in()` raises `SponsorkitError` with one of these codes:

| Code | Meaning |
|---|---|
| `disabled` | `SPONSORKIT_DISABLE` is set. |
| `invalid_config` | A provider that isn't one of your targets, an unknown `method`, a target that doesn't exist (development checks), or the session couldn't be saved to storage. |
| `access_denied` | The person declined at GitHub or Open Collective. |
| `invalid_state`, `provider_error` | The provider sign-in failed; `provider_error` also when `method="loopback"` can't bind `127.0.0.1`. |
| `invalid_code` | The API rejected the code (expired, mistyped or tampered with). Ask the person to try again. |
| `network_error` | The API couldn't be reached or answered unexpectedly. `retry_after` is set when it sent `Retry-After`. |
| `timeout` | No code arrived within `sign_in_timeout`. |
| `cancelled` | The `cancel` event was set, or the paste-back prompt got an empty answer. |

More in [Errors and cancellation](errors.md).
