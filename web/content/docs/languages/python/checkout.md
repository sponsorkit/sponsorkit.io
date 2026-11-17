---
title: Checkout in Python
description: Send users to contribute with open_checkout(), which waits for the contribution to show up, or with a plain checkout_url() link.
sidebar_label: Checkout
order: 40
---

There are two ways to send someone to contribute:

| | `open_checkout()` | `checkout_url()` |
|---|---|---|
| Returns | `CheckoutResult` | `str` |
| Signs in | Yes, first, if needed | No |
| Network and disk | Yes | Neither |
| Knows when they contributed | Yes, by re-checking until the contribution appears | No |
| Good for | A `sponsor` command or a "Support" menu item | Nag messages, `--help` output, READMEs, About dialogs |

Both take the same keyword-only options, all optional:

| Option | Meaning |
|---|---|
| `provider` | `"github"` or `"opencollective"`; must be one of your targets. Without it, the checkout page lets the person choose. |
| `amount` | Suggested amount as a positive `int` in minor units: `500` is 5.00. |
| `currency` | Three uppercase letters (ISO 4217), e.g. `"USD"` or `"EUR"`. |
| `frequency` | `"one_time"`, `"monthly"` or `"yearly"`. |

Anything else raises `SponsorkitError("invalid_config")`, including from `checkout_url()`. `open_checkout()`
also raises it when `timeout` or `poll_interval` is not a finite positive number of seconds. The amount,
currency and frequency are suggestions that pre-fill the provider's page; the person can change them there.

```python title="sponsor.py"
import sys
import threading

from sponsorkit import Sponsorkit, SponsorkitError

sk = Sponsorkit(github="octocat", opencollective="my-collective", app_name="my-cli")

# A plain link: offline, no sign-in. Good for --help output and READMEs.
print(sk.checkout_url())
print(sk.checkout_url(provider="github", frequency="monthly", amount=1000, currency="USD"))

cancel = threading.Event()
try:
    result = sk.open_checkout(
        provider="opencollective",
        frequency="one_time",
        amount=2500,  # minor units: 25.00
        currency="EUR",
        timeout=300,  # stop polling after 5 minutes
        poll_interval=15,
        cancel=cancel,
    )
except SponsorkitError as e:
    print(f"Could not start checkout ({e.code})", file=sys.stderr)
else:
    if result.status == "contributed" and result.contribution is not None:
        print("Thank you!", result.contribution.amount)
    else:
        print("Nothing detected yet; it may take a minute to show up.")
```

## What `open_checkout()` does

1. **Signs in if needed.** Without a stored session it signs in first (with the same
   [loopback or paste-back](sign-in.md#loopback-and-paste-back) flow as `sign_in()`), because a contribution can
   only be detected for someone who is signed in. The sign-in starts from the checkout page, and with loopback
   sign-in the browser continues straight to checkout afterwards. This phase is bounded by `sign_in_timeout`.
2. **Opens the checkout page.** When already signed in, it opens the checkout page in the browser (or prints the
   link when the browser can't be opened).
3. **Waits for the contribution.** It re-checks the contributions every `poll_interval` seconds (default: the
   `checkout_poll_interval` option, 60 seconds) and returns as soon as a contribution is new or has changed
   compared with before. `timeout` (default 600 seconds) covers only this phase.

It returns a `CheckoutResult`:

| `status` | `contribution` | Meaning |
|---|---|---|
| `"contributed"` | the new or changed `Contribution` | Thank them! The cache already includes it. |
| `"unknown"` | `None` | Polling timed out, or `cancel` was set. They may still have paid: payments can take a few minutes to reach the provider's API. |

Setting `cancel` (a `threading.Event`) returns `CheckoutResult("unknown")` during either phase instead of
raising. A sign-in that times out still raises `timeout`; other sign-in failures raise their usual
[errors](sign-in.md#errors), and `SPONSORKIT_DISABLE` raises `disabled`.

### With asyncio

`aopen_checkout()` takes the same arguments; `cancel` may be an `asyncio.Event` or a `threading.Event`, and
cancelling the awaiting task stops the polling and raises `asyncio.CancelledError`.

```python
result = await sk.aopen_checkout(frequency="monthly", amount=500)
```

## Mock mode

In [mock mode](testing.md#mock-mode) `open_checkout()` returns immediately with a simulated contribution built
from your options: 5.00 USD monthly when you pass none, `status="active"` for recurring frequencies and
`status="paid"` for `"one_time"`. The mock client is signed in afterwards and later calls to
`get_financial_contribution()` include the new contribution, so you can test the whole "thank you" path
offline.

See the [checkout guide](../../guides/checkout.md) for the reasoning behind the flow in every language.
