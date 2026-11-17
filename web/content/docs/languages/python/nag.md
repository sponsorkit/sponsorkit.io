---
title: Nag in Python
description: Ask for support every N runs or N days with sk.nag(), never in CI or non-interactive sessions, and never someone who already contributes.
sidebar_label: Nag
order: 50
---

A nag is a gentle "Enjoying this? Consider supporting it" message. `sk.nag()` remembers how often and when it
was shown, so you only decide what to print and where. The reasoning behind the defaults is in the
[nag guide](../../guides/nag.md).

```python title="cli.py"
import sys
from datetime import timedelta

from sponsorkit import ContributionResult, Sponsorkit

sk = Sponsorkit(github="octocat", app_name="my-cli")


def not_supporting(fc: ContributionResult) -> bool:
    return not fc.active()


nag = sk.nag("my-cli", every=20, or_every=timedelta(days=14))
if nag.due(not_supporting):
    print(f"Enjoying my-cli? Support it: {sk.checkout_url(frequency='monthly')}", file=sys.stderr)
    nag.shown()
```

## Creating a nag

`sk.nag(id, *, every=10, or_every=None)` returns a `Nag`. It doesn't do any I/O.

| Argument | Meaning |
|---|---|
| `id` | A non-empty name for the counter. Several nags with different ids can coexist. |
| `every` | Due once this many runs have been counted since it was last shown. A positive `int`; default `10`. |
| `or_every` | Also due once this much time has passed since it was last shown: an ISO-8601 duration string (`"P7D"`, `"PT12H"`, `"P1W"`) or a `datetime.timedelta`. Default: no time rule. |

Invalid arguments raise `SponsorkitError("invalid_config")`. In durations, a year counts as 365 days and a month
as 30 days; `sponsorkit.parse_duration()` is the parser, if you want to validate a value from a config file.

## When it's due

- **A run is a process.** The counter goes up by one, per `id`, on the first `due()` call in a process; calling
  `due()` again in the same process doesn't count again.
- `due(predicate)` returns `True` when `predicate(result)` is true **and** either the counter has reached
  `every` or `or_every` has passed since the nag was last shown. The predicate receives the current
  `ContributionResult` (from the cache when it is fresh), so `lambda fc: not fc.active()` never nags someone who
  supports you. Without a predicate, only the counters decide.
- `shown()` resets the counter and records the time. Call it only when you really displayed the message.

The time rule only applies after the nag has been shown once; before that, the run counter decides.

## When it's never due

`due()` returns `False`, without calling the predicate or the API, when:

- `SPONSORKIT_DISABLE` is set (even with `force=True`);
- `SPONSORKIT_NO_NAG` or `CI` is set;
- the session isn't interactive: standard output or standard error isn't a terminal. Override the detection with
  the `interactive` option, for example `interactive=True` in a GUI app where there is no terminal but you show
  the nag in a dialog.

`due(force=True)` skips the last two checks; the predicate and the counters still apply. Runs are still counted
while `SPONSORKIT_NO_NAG`, `CI` or a non-interactive session keeps the nag quiet, so the counter is right when
that changes. With `SPONSORKIT_DISABLE` nothing is counted or stored.

A nag never signs anyone in. When nobody is signed in, the predicate receives a signed-out result, so decide
whether to nag signed-out users too: `lambda fc: not fc.active()` does, `lambda fc: fc.signed_in and not
fc.active()` doesn't.

## Async

`await nag.adue(predicate)` and `await nag.ashown()` run the same logic in a worker thread.

## Where the counters live

Nag state is stored per `id` in the same [state file](platform-notes.md#where-state-is-kept) as the session, so
it survives restarts and is kept when the person signs out. In mock mode it lives in memory, per client
instance. To test a nag, see [Testing](testing.md#testing-a-nag).
