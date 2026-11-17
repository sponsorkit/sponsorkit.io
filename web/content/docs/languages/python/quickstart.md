---
title: Python quickstart
description: A complete command-line tool that checks for a contribution, signs a supporter in and opens checkout, plus the same flow with asyncio.
sidebar_label: Quickstart
order: 5
---

This page builds `my-cli`, a small command-line tool with four commands: `status`, `login`, `logout` and
`sponsor`. Replace `octocat` and `my-collective` with the accounts you receive contributions on (one of the two
is enough).

```bash title="Terminal"
python -m pip install sponsorkit
```

## The program

```python title="my_cli.py"
"""my-cli: a tiny command-line tool that knows who supports it."""

import argparse
import sys

from sponsorkit import Sponsorkit, SponsorkitError

sk = Sponsorkit(github="octocat", opencollective="my-collective", app_name="my-cli")


def status() -> None:
    fc = sk.get_financial_contribution()  # never raises because of the network
    if not fc.signed_in:
        print("Not signed in. Run `my-cli login` to connect GitHub or Open Collective.")
    elif fc.active():
        print(f"Thank you for supporting my-cli! ({len(fc.active())} active contribution(s))")
    else:
        print(f"Signed in, no active contribution. Support my-cli: {sk.checkout_url()}")


def login() -> int:
    try:
        sk.sign_in()  # opens the browser, or prints a link over SSH
    except SponsorkitError as e:
        print(f"Sign-in failed ({e.code}): {e}", file=sys.stderr)
        return 1
    status()
    return 0


def sponsor() -> int:
    try:
        result = sk.open_checkout(frequency="monthly", amount=500)  # $5.00 a month
    except SponsorkitError as e:
        print(f"Checkout failed ({e.code}): {e}", file=sys.stderr)
        return 1
    if result.contribution is not None:
        amount = result.contribution.amount
        print(f"Thank you! {amount.value / 100:.2f} {amount.currency} received.")
    else:
        print("No new contribution yet. It can take a minute to show up; run `my-cli status` later.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="my-cli")
    parser.add_argument("command", choices=["status", "login", "logout", "sponsor"])
    command = parser.parse_args().command
    if command == "login":
        return login()
    if command == "logout":
        sk.sign_out()
        print("Signed out.")
        return 0
    if command == "sponsor":
        return sponsor()
    status()
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Try it without an account or a network connection, using [mock mode](testing.md#mock-mode):

```bash title="Terminal"
SPONSORKIT_MOCK=active-monthly python my_cli.py status
# Thank you for supporting my-cli! (1 active contribution(s))
SPONSORKIT_MOCK=signed-out python my_cli.py status
# Not signed in. Run `my-cli login` to connect GitHub or Open Collective.
```

Then for real:

```bash title="Terminal"
python my_cli.py login     # opens your browser; over SSH it prints a link and asks for a code
python my_cli.py status
python my_cli.py sponsor   # opens the checkout page and waits for the contribution to show up
```

## What happened

- **Constructing** `Sponsorkit(...)` validates the targets and options and does no I/O. A typo in an option or
  an invalid account name raises `SponsorkitError` with code `invalid_config` right there.
- **`get_financial_contribution()`** returns a signed-out result without any request when nobody has signed
  in. Once someone has, it asks the Sponsorkit API and caches the answer on disk for an hour. If the API can't
  be reached it returns the cached result marked `stale=True` instead of raising, so `status` can't crash.
- **`sign_in()`** opens the consent page in the browser and receives the result on a short-lived listener on
  `127.0.0.1`. Over SSH or without a display it prints a link to open on any device and asks for the code shown
  there. See [Sign-in](sign-in.md).
- **`open_checkout()`** signs in first if needed, opens the checkout page, then re-checks every minute (for up
  to ten minutes) until a new or changed contribution appears. See [Checkout](checkout.md).
- **`checkout_url()`** builds a plain link without signing in or touching the network, which is all the
  `status` message needs.

The session token, the cached result and nag counters are kept in one small JSON file in the per-user config
directory (`~/.config/sponsorkit` on Linux). Every Sponsorkit SDK uses the same file, so a person who signs in
through your Python tool is signed in to your Go tool with the same targets too.

## With asyncio

Every blocking method has an async twin with an `a` prefix. They run the blocking implementation in a worker
thread (`asyncio.to_thread`), so they never block the event loop:

```python title="bot.py"
import asyncio

from sponsorkit import Sponsorkit


async def main() -> None:
    sk = Sponsorkit(github="octocat", app_name="my-bot")
    fc = await sk.aget_financial_contribution()
    if not fc.signed_in:
        fc = await sk.asign_in()
    print(f"{len(fc.active())} active contribution(s)")


asyncio.run(main())
```

The async variants are `aget_financial_contribution`, `asign_in`, `aopen_checkout`, `asign_out` and
`ais_signed_in` on the client, `adue` and `ashown` on a nag, and `averify_session` for backends.
`checkout_url()` and `nag()` don't do I/O, so they have no async variant.

## Next steps

- Show a gentle reminder every few runs: [Nag](nag.md).
- Decide what counts as a supporter: [Contributions](contributions.md) and
  [Gating features](../../guides/gate-features.md).
- Test the code around Sponsorkit without real sponsorships: [Testing](testing.md).
- Check supporters on a server: [Backend verification](backend-verification.md).
