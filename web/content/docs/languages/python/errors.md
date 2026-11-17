---
title: Errors and cancellation in Python
description: SponsorkitError and its codes, what raises and what doesn't, retry_after and request_id, and cancelling sign-in and checkout with events or task cancellation.
sidebar_label: Errors and cancellation
order: 80
---

The SDK is built so that Sponsorkit can't break your program: reading contributions doesn't raise because of
the network, and everything that can fail raises one documented exception type, `SponsorkitError`. The
language-neutral rules are in the [error contract](/docs/concepts/error-contract).

## What raises, and what doesn't

| Call | Raises |
|---|---|
| `Sponsorkit(...)` | `invalid_config` for a missing or malformed target or option. Never does I/O. |
| `get_financial_contribution()` | Only `invalid_config` from the [development-time check](configuration.md#development-checks). Network and server problems return cached data with `stale=True`. |
| `is_signed_in()`, `checkout_url()`, `nag()` | Only `invalid_config` for invalid arguments. No network. |
| `sign_in()` | `disabled`, `invalid_config`, `access_denied`, `invalid_state`, `provider_error`, `invalid_code`, `network_error`, `timeout`, `cancelled`. See [Sign-in errors](sign-in.md#errors). |
| `open_checkout()` | `disabled`, `invalid_config`, or a sign-in error when it has to sign in first. A polling timeout or `cancel` returns `CheckoutResult("unknown")` instead. |
| `sign_out()` | `invalid_config` when the state file can't be updated. A no-op when disabled. |
| `nag.due()`, `nag.shown()` | Only `invalid_config` from the development-time check (`due()` reads the contributions), and whatever your predicate raises. Storage problems are logged, not raised. |
| `verify_session()` | `session_invalid`, `targets_mismatch`, `network_error`, `invalid_config`. See [Backend verification](backend-verification.md#errors). |

Reading local state never raises: a missing, corrupt or unreadable state file counts as "nothing stored" and is
logged on the `sponsorkit` logger.

## `SponsorkitError`

```python
class SponsorkitError(Exception):
    code: ErrorCode            # stable, machine-readable
    request_id: str | None     # Sponsorkit-Request-Id of the failed API response, if any
    retry_after: float | None  # network_error only: seconds from the API's Retry-After, if sent
```

Branch on `code`, never on the message. `ErrorCode` is a `Literal` type alias, so type checkers flag a misspelled
code in a comparison or `match` statement:

```python title="login.py"
import sys
import time

from sponsorkit import Sponsorkit, SponsorkitError

sk = Sponsorkit(github="octocat", app_name="my-cli")

try:
    sk.sign_in()
except SponsorkitError as e:
    match e.code:
        case "cancelled" | "timeout":
            print("Sign-in was not completed.", file=sys.stderr)
        case "access_denied":
            print("You declined access at GitHub or Open Collective.", file=sys.stderr)
        case "disabled":
            pass  # SPONSORKIT_DISABLE is set: stay quiet
        case "network_error":
            wait = e.retry_after or 0
            print(f"Sponsorkit is unreachable; try again in {wait:.0f} s.", file=sys.stderr)
            time.sleep(min(wait, 5))
        case _:
            print(f"Sign-in failed ({e.code}, request {e.request_id}): {e}", file=sys.stderr)
```

| Code | Meaning |
|---|---|
| `invalid_config` | A missing or malformed target, an invalid option or checkout option, an unknown mock preset, storage that can't be written when signing in or out, or (development checks) a target that doesn't exist. |
| `disabled` | `SPONSORKIT_DISABLE` is set; raised by `sign_in()` and `open_checkout()`. |
| `popup_blocked` | Browser SDKs only. Never raised in Python. |
| `access_denied` | The person declined at the provider. |
| `invalid_state`, `provider_error` | The provider sign-in failed; `provider_error` also when loopback was forced and `127.0.0.1` can't be bound. |
| `invalid_code` | The API rejected the sign-in code. |
| `cancelled` | A sign-in was cancelled through `cancel` or with an empty paste-back answer. Cancelling the task that awaits `asign_in()` raises `asyncio.CancelledError` instead (see [Cancellation](#cancellation)). |
| `timeout` | A sign-in took longer than `sign_in_timeout`, or than the `timeout` passed to `sign_in()`. |
| `network_error` | The API couldn't be reached, timed out (`request_timeout`), or answered `5xx`, `429` or something unexpected. |
| `session_invalid`, `targets_mismatch` | Only from `verify_session()`. |

When `SponsorkitError` wraps another exception (an `httpx` error, an `OSError` from storage), the original is
available as `__cause__`.

### Retrying

`retry_after` is only set for `network_error`, and only when the API sent a `Retry-After` header; it is clamped
to 24 hours. Retrying sign-in automatically is rarely right, because it needs the person again; show the error
and let them try again. `invalid_code` usually means the code expired or was mistyped.

## Cancellation

Python has no single cancellation token, so the SDK accepts the primitives you already use:

| Call | `cancel=` accepts | Task cancellation |
|---|---|---|
| `sign_in()`, `open_checkout()` | `threading.Event` (alias `sponsorkit.CancelEvent`) | n/a |
| `asign_in()`, `aopen_checkout()` | `asyncio.Event` or `threading.Event` | Cancelling the awaiting task stops the work and raises `asyncio.CancelledError`. |

Setting the event:

- during a sign-in raises `SponsorkitError("cancelled")` within about 50 ms;
- during `open_checkout()` (its sign-in phase or its polling) returns `CheckoutResult("unknown")`.

A paste-back prompt that is blocked reading stdin can't be interrupted; the SDK abandons it in a daemon thread.
See the [stdin warning](sign-in.md#custom-browser-and-prompt).

`get_financial_contribution()` takes no `cancel`; it is bounded by `request_timeout` (30 seconds by default) and
returns the cached result when that runs out.

## Logging

The SDK logs to the standard `logging` logger named `sponsorkit`: warnings when the state file can't be read or
written or no per-user directory exists, info when the API is unreachable and the cache is served. It adds no
handlers of its own. If your app doesn't configure logging, Python's last-resort handler prints warnings to
standard error; to keep a CLI's output clean, raise the level:

```python
import logging

logging.getLogger("sponsorkit").setLevel(logging.ERROR)
```

The URLs and prompts of interactive sign-in and checkout are written to standard error with `print`, not
logged.
