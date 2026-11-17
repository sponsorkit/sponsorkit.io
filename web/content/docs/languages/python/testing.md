---
title: Testing with Python
description: Mock mode presets and custom contributions, testing your rule and your nag with pytest, and running the real client logic against a fake API with httpx.MockTransport.
sidebar_label: Testing
order: 60
---

You shouldn't need a real sponsorship to develop or test the code around Sponsorkit. The SDK gives you two levels
of fakes:

1. **Mock mode**: canned results, no network, no disk. Enough to test your rule, your messages and your nag.
2. **Injected `storage`, `clock`, `env` and `http_client`**: the real client logic (caching, outages, expired
   sessions) against responses you control.

## Mock mode

Pass a preset name as `mock`, or set `SPONSORKIT_MOCK` for a whole run:

```python
sk = Sponsorkit(github="octocat", mock="active-monthly")
```

```bash title="Terminal"
SPONSORKIT_MOCK=active-monthly python my_cli.py status
```

| Preset | Signed in | Contributions |
|---|---|---|
| `signed-out` | No | None |
| `none` | Yes | None |
| `active-monthly` | Yes | 5.00 USD monthly, `active`, made directly |
| `one-time` | Yes | 25.00 USD once, `paid` |
| `cancelled` | Yes | 5.00 USD monthly, `cancelled` |
| `org` | Yes | 10.00 USD monthly, `active`, made by an organization (`via="organization"`) |

The contributions use your first target (in canonical order) as their provider and target. In mock mode:

- nothing touches the network or the disk; nag state lives in memory, per client instance;
- `sign_in()` returns immediately and the client is signed in afterwards (with no contributions if it was signed
  out);
- `open_checkout()` returns `CheckoutResult("contributed", ...)` immediately with a contribution built from
  your options, and later results include it (see [Checkout](checkout.md#mock-mode));
- `sign_out()` switches to the signed-out result;
- results have `mock=True`.

The `mock` option beats `SPONSORKIT_MOCK`, and `SPONSORKIT_DISABLE` beats both. An unknown preset name raises
`invalid_config`. The [mock mode guide](../../guides/mock-mode.md) describes the presets in every language.

### Custom contributions

`mock={"contributions": [...]}` reports a signed-in supporter with exactly the contributions you give, as
`Contribution` objects or in their camelCase JSON form (the same shape `Contribution.to_dict()` returns).
A malformed contribution raises `invalid_config`.

## Testing your rule

Pass `env={}` in tests so a `SPONSORKIT_MOCK`, `SPONSORKIT_DISABLE` or `CI` variable on the machine running
them can't change the outcome.

```python title="test_rule.py"
from typing import Any

import pytest

from sponsorkit import ContributionResult, MockPreset, Sponsorkit


def is_supporter(fc: ContributionResult) -> bool:
    return any(c.amount.currency == "USD" and c.amount.value >= 500 for c in fc.active())


@pytest.mark.parametrize(
    ("preset", "expected"),
    [
        ("signed-out", False),
        ("none", False),
        ("active-monthly", True),
        ("one-time", False),
        ("cancelled", False),
        ("org", True),
    ],
)
def test_rule(preset: MockPreset, expected: bool) -> None:
    sk = Sponsorkit(github="octocat", mock=preset, env={})
    assert is_supporter(sk.get_financial_contribution()) is expected


def test_three_dollars_is_not_enough() -> None:
    contribution: dict[str, Any] = {
        "id": "con_github_test",
        "provider": "github",
        "target": "github:octocat",
        "sponsor": {"type": "user", "provider": "github", "id": "1", "handle": "mona"},
        "via": "direct",
        "kind": "recurring",
        "frequency": "monthly",
        "status": "active",
        "amount": {"value": 300, "currency": "USD"},
        "tier": None,
        "flags": [],
        "private": False,
        "startedAt": "2026-01-01T00:00:00Z",
        "endedAt": None,
        "lastChargedAt": None,
        "nextChargeAt": None,
        "totalContributed": None,
    }
    sk = Sponsorkit(github="octocat", mock={"contributions": [contribution]}, env={})
    assert not is_supporter(sk.get_financial_contribution())


def test_thank_you_after_checkout() -> None:
    sk = Sponsorkit(github="octocat", mock="signed-out", env={})
    result = sk.open_checkout(frequency="monthly", amount=1000)
    assert result.status == "contributed"
    assert is_supporter(sk.get_financial_contribution())
```

### Forget per-process state between tests

Some state deliberately lives for the whole process: which nags have already counted a run, the result of the
[development-time target check](configuration.md#development-checks), and a `Retry-After` the API sent. In a
test process that means one test can affect the next. `reset_process_state()` forgets all of it, as if the
program had restarted; an autouse fixture keeps every test independent:

```python title="conftest.py"
from collections.abc import Iterator

import pytest

from sponsorkit import reset_process_state


@pytest.fixture(autouse=True)
def fresh_process() -> Iterator[None]:
    reset_process_state()  # forget nag runs, the dev check and Retry-After between tests
    yield
    reset_process_state()
```

## Testing a nag

A nag counts one run per process, so simulate several runs by calling `reset_process_state()` and creating a new
client on the same storage each time. `MemoryStorage` plays the part of the state file. Pass `interactive=True`,
because pytest captures output and the nag is never due when stdout isn't a terminal:

```python title="test_nag.py"
from sponsorkit import MemoryStorage, Sponsorkit, reset_process_state


def test_nag_every_three_runs() -> None:
    storage = MemoryStorage()  # survives the simulated restarts, like the file on disk
    shown = []
    for _run in range(6):
        reset_process_state()  # each iteration is a new process
        sk = Sponsorkit(github="octocat", storage=storage, env={}, interactive=True)
        nag = sk.nag("my-cli", every=3)
        if nag.due():
            nag.shown()
            shown.append(_run)
    assert shown == [2, 5]


def test_never_in_ci() -> None:
    sk = Sponsorkit(github="octocat", mock="none", env={"CI": "true"}, interactive=True)
    assert not sk.nag("my-cli", every=1).due()
```

For the `or_every` time rule, pass a `clock` and move it forward between runs.

## Real logic against a fake API

Mock mode replaces the whole client. To test what happens around the network (the cache, an outage, an expired
session), keep the real client and replace its HTTP transport with
[`httpx.MockTransport`](https://www.python-httpx.org/advanced/transports/#mock-transports):

- `http_client=httpx.Client(transport=httpx.MockTransport(handler))` answers every API call with your
  `handler(request)`;
- `storage=MemoryStorage()` keeps state out of your home directory;
- `clock=lambda: now` controls cache age and nag timing;
- `env={}` shields the test from the machine's environment.

To start signed in, write a session token into the storage under the client's `targets_hash`, in the
[storage format](platform-notes.md#where-state-is-kept) every SDK shares:

```python title="test_api.py"
import json
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from sponsorkit import MemoryStorage, Sponsorkit

RESULT: dict[str, Any] = {
    "signedIn": True,
    "disabled": False,
    "mock": False,
    "targets": ["github:octocat"],
    "supporter": {"id": "sup_test", "identities": []},
    "contributions": [],
    "fetchedAt": "2026-11-17T12:00:00Z",
    "stale": False,
    "fromCache": False,
}


def signed_in_client(handler: Any, clock: Any) -> Sponsorkit:
    storage = MemoryStorage()
    sk = Sponsorkit(
        github="octocat",
        env={},
        storage=storage,
        clock=clock,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    # Pretend someone signed in earlier: write the shared storage format directly.
    storage.write(sk.targets_hash, json.dumps({"v": 1, "sessionToken": "sks_test"}))
    return sk


def test_cache_and_outage() -> None:
    now = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)
    status = 200
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.headers["Authorization"])
        return httpx.Response(status, json=RESULT)

    sk = signed_in_client(handler, lambda: now)
    assert sk.get_financial_contribution().signed_in
    assert sk.get_financial_contribution().from_cache  # within the hour: no request
    assert calls == ["Bearer sks_test"]

    now += timedelta(hours=2)
    status = 503  # the API is down: the cached result comes back, marked stale
    fc = sk.get_financial_contribution()
    assert fc.signed_in and fc.stale and fc.from_cache


def test_expired_session_signs_out() -> None:
    sk = signed_in_client(lambda request: httpx.Response(401), None)
    assert not sk.get_financial_contribution().signed_in
    assert not sk.is_signed_in()
```

The same hooks test sign-in without a browser: pass `sign_in_method="paste"` and a `prompt_for_code` that
returns a code, and answer `POST /api/v1/auth/token` in your handler with
`{"sessionToken": "sks_…", "result": {…}}`. The request and response shapes are in the [HTTP API](/docs/reference-http/http-api).

## In CI

- CI services set `CI`, which keeps nags quiet.
- Set `SPONSORKIT_DISABLE=1` for end-to-end tests of your app that shouldn't depend on Sponsorkit at all, or
  `SPONSORKIT_MOCK=<preset>` to run them as a supporter.
- Nothing above needs network access or credentials.
