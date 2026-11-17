---
title: Reading contributions in Python
description: get_financial_contribution(), the ContributionResult and Contribution dataclasses, the filter helpers, caching, and writing your own rule.
sidebar_label: Contributions
order: 30
---

`get_financial_contribution()` answers "what has the current user contributed to my targets?". It is safe to
call on every start-up:

- **Signed out**: it returns a signed-out result without any request.
- **Fresh cache**: it returns the cached result (`from_cache=True`) without any request. The cache lasts
  `cache_ttl` seconds, one hour by default.
- **Otherwise** it asks the Sponsorkit API, which asks GitHub and Open Collective live with the supporter's
  permission, and caches the answer.
- **Never raises because of the network.** When the API can't be reached, times out, answers `5xx` or rate
  limits the request, you get the cached result with `stale=True`, or an empty signed-in result with
  `stale=True` when nothing is cached.

The only exception it can raise is `invalid_config`, from the [development-time target
check](configuration.md#development-checks).

## Write your own rule

Sponsorkit reports facts; deciding what counts as "a supporter" is up to you. Write it as a function of the
result so it's easy to [test with mock mode](testing.md#testing-your-rule):

```python title="rules.py"
from sponsorkit import ContributionResult, Sponsorkit

sk = Sponsorkit(github="octocat", opencollective="my-collective")


def is_supporter(fc: ContributionResult) -> bool:
    """Your rule: at least $5 on any active USD contribution, made by the user or their organization."""
    return any(c.amount.currency == "USD" and c.amount.value >= 500 for c in fc.active())


fc = sk.get_financial_contribution()
if is_supporter(fc):
    print("Pro features unlocked. Thank you!")
if fc.stale:
    print("(Could not reach Sponsorkit; showing the last known state.)")

for c in fc.contributions:
    who = "you" if c.via == "direct" else f"your organization {c.sponsor.handle}"
    print(f"{c.target}: {c.amount.value / 100:.2f} {c.amount.currency} {c.frequency}, {c.status}, by {who}")

monthly_on_github = [c for c in fc.by_provider("github") if c.frequency == "monthly"]
print(len(fc.recurring()), len(fc.one_time()), len(fc.direct()), len(monthly_on_github))
print(fc.to_dict()["signedIn"])
```

Things to keep in mind when writing a rule:

- **Amounts are integers in minor units** (`500` is $5.00) with an uppercase ISO 4217 currency. The SDK never
  converts or sums across currencies or providers, so compare within one currency or decide how you want to
  treat others.
- **Organization sponsorships are included.** A contribution made by an organization the person belongs to has
  `via="organization"`; use `fc.direct()` if only their own contributions should count. See
  [Organizations](/docs/concepts/organizations).
- **`active()` is usually what you want** for recurring support. One-time contributions end up `paid`, so a rule
  that also rewards past one-time gifts looks at `fc.one_time()` too. See [Statuses](/docs/concepts/statuses).

## The result

`ContributionResult` is a frozen dataclass with snake_case attributes. `to_dict()` returns the camelCase JSON
shape that every Sponsorkit SDK and the HTTP API share.

| Attribute | Type | Meaning |
|---|---|---|
| `signed_in` | `bool` | Whether a session is stored for these targets. |
| `disabled` | `bool` | `SPONSORKIT_DISABLE` is set; the result is then signed out, with no contributions. |
| `mock` | `bool` | The result comes from mock mode. |
| `targets` | `tuple[str, ...]` | Your canonical targets, e.g. `("github:octocat",)`. |
| `supporter` | `Supporter \| None` | The signed-in supporter: a pairwise `id` (`sup_…`) and their `identities`. |
| `contributions` | `tuple[Contribution, ...]` | Everything they (or their organizations) contributed to your targets. |
| `fetched_at` | `str \| None` | ISO-8601 time the API produced the result. |
| `stale` | `bool` | Some provider couldn't be reached; its data, if any, comes from the local cache. |
| `from_cache` | `bool` | The whole result was served from the local cache. |
| `unavailable` | `tuple[Provider, ...] \| None` | Providers the API couldn't query this time (API results only). |

Filter helpers return lists and never sum anything:

| Helper | Returns contributions… |
|---|---|
| `fc.active()` | whose `status` is `"active"` |
| `fc.recurring()` | with `kind == "recurring"` (any status) |
| `fc.one_time()` | with `kind == "one_time"` (any status) |
| `fc.by_provider("github")` | made through that provider |
| `fc.direct()` | made by the person themselves, not by an organization |

Each `Contribution` has:

| Attribute | Type | Meaning |
|---|---|---|
| `id` | `str` | Stable id, `con_<provider>_…`. |
| `provider` | `"github" \| "opencollective"` | Where it was made. |
| `target` | `str` | Which of your targets, e.g. `"github:octocat"`. |
| `sponsor` | `SponsorEntity` | Who pays: `type` (`"user"` or `"organization"`), `provider`, `id`, `handle`. |
| `via` | `"direct" \| "organization"` | Whether the person or one of their organizations pays. |
| `kind` | `"recurring" \| "one_time"` | |
| `frequency` | `"one_time" \| "monthly" \| "yearly"` | |
| `status` | `Status` | `active`, `paused`, `cancelled`, `paid`, `refunded`, `disputed`, `failed` or `pending`. |
| `amount` | `Money` | `value` in minor units and `currency`. |
| `tier` | `Tier \| None` | The provider tier (`id`, `name`), if any. |
| `flags` | `tuple[str, ...]` | Provider-specific markers. |
| `private` | `bool` | The supporter made it private on the provider. |
| `started_at`, `ended_at`, `last_charged_at`, `next_charge_at` | `str \| None` | ISO-8601 timestamps, when known. |
| `total_contributed` | `Money \| None` | Lifetime total, when the provider reports one. |

The meaning of each field is the same in every SDK: [Contributions](/docs/concepts/contributions). Full
signatures: [`ContributionResult`](/docs/reference/python/contributionresult) and
[`Contribution`](/docs/reference/python/contribution).

## Caching

Set the cache lifetime for the client, or ask for fresher data for one call:

```python
sk = Sponsorkit(github="octocat", cache_ttl=6 * 3600)  # seconds, minimum 60

sk.get_financial_contribution()  # cached for up to 6 hours
fresh = sk.get_financial_contribution(cache_ttl=0)  # ask the API now
```

A per-call `cache_ttl` can be any value `>= 0`; the 60-second minimum only applies to the option. Ask for fresh
data when it matters (right after the person says they just contributed), not on every call: each miss is a live
query to GitHub or Open Collective, and the API allows one refresh per minute per session.

How the cache behaves under failure:

- **`429` (rate limited)**: the client doesn't call the API again in this process until the `Retry-After` time
  has passed (60 seconds when the header is missing) and serves the cache meanwhile.
- **One provider down**: the API still answers, listing the provider in `unavailable`. The client keeps that
  provider's contributions from the cache, adds them to the fresh ones and sets `stale=True`.
- **Session rejected (`401`)**: the stored session is cleared and the result is signed out.

The cache lives in the [state file](platform-notes.md#where-state-is-kept), so it survives restarts. See
[Caching & freshness](/docs/concepts/caching) for the reasoning.

## Showing stale data

`stale=True` means "this may be out of date", not "this is wrong". Keep using the result; at most, mention it:

```python
fc = sk.get_financial_contribution()
if fc.stale:
    print("(Couldn't reach Sponsorkit; showing the last known state.)")
```

[Errors and offline](../../guides/errors-and-offline.md) explains why the SDK prefers stale data to errors.
