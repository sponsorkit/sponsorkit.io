---
title: Reading contributions in JavaScript / TypeScript
description: getFinancialContribution(), the FinancialContribution result and its filter helpers, caching, and gating features.
sidebar_label: Contributions
order: 30
---

`getFinancialContribution()` answers "what has the current user contributed to my targets?". It is safe to call
on every start-up or page load:

- **Signed out**: it returns a signed-out result without any network request.
- **Fresh cache**: it returns the cached result (`fromCache: true`) without a request. The cache lasts
  `cacheTtl` seconds (default 3600).
- **Otherwise** it asks the Sponsorkit API and caches the answer.
- **Expired or revoked session**: the SDK deletes the token and cache and returns a signed-out result.
- **Never throws for network or server problems.** If the API can't be reached, times out, or answers with a
  5xx or 429, it returns the last cached result marked `stale: true`, or a signed-in empty result marked
  `stale: true` when there is no cache. After a 429 it honours `Retry-After` before calling the API again.

The details are in [Caching](/docs/concepts/caching) and the [error contract](/docs/concepts/error-contract).

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-collective" });

const fc = await sk.getFinancialContribution();
if (fc.active().length > 0) console.log("Thanks for your support!");

// Bypass the cache, e.g. right after the user says "I just sponsored":
const fresh = await sk.getFinancialContribution({ cacheTtl: 0 });
console.log(fresh.fromCache); // false, unless the API couldn't be reached
```

## The result

The promise resolves to a [`FinancialContribution`](/docs/reference/js/sdk/financialcontribution): the plain
result object every Sponsorkit SDK returns, plus helper methods. `JSON.stringify(fc)` gives exactly the protocol
shape, so you can hand it to your own API or store it.

| Field | Type | Meaning |
|---|---|---|
| `signedIn` | `boolean` | A session exists. |
| `disabled` | `boolean` | `SPONSORKIT_DISABLE` is set; everything else is empty. |
| `mock` | `boolean` | The result comes from mock mode. |
| `targets` | `string[]` | Canonical targets, e.g. `["github:octocat"]`. |
| `supporter` | `Supporter \| null` | The signed-in supporter: a pairwise `id` and their linked `identities`. |
| `contributions` | `Contribution[]` | Every contribution to your targets, in any status. |
| `fetchedAt` | `string \| null` | When the API produced the data (ISO 8601). |
| `stale` | `boolean` | Some or all data could not be refreshed and comes from the cache. |
| `fromCache` | `boolean` | The whole result was served from the local cache. |
| `unavailable` | `Provider[]` (optional) | Providers the API could not query this time. Their contributions, if cached, are filled in from the cache. |

Each [`Contribution`](/docs/reference/js/sdk/contribution) has, among others, `provider`, `target`, `status`
(`active`, `paused`, `cancelled`, `paid`, `refunded`, `disputed`, `failed` or `pending`), `kind` (`recurring` or
`one_time`), `frequency` (`one_time`, `monthly` or `yearly`), `amount` (`{ value, currency }` in minor units),
`via` (`direct` or `organization`), `sponsor`, `tier` and dates. What each status means:
[Statuses](/docs/concepts/statuses).

## Filter helpers

The helpers only filter. They never add amounts across providers or currencies, because a sum of USD and EUR
amounts, or of a monthly and a one-time contribution, isn't meaningful. Decide what counts for your app.

| Helper | Returns |
|---|---|
| `fc.active()` | Contributions with status `active`. |
| `fc.recurring()` | Recurring contributions, any status. |
| `fc.oneTime()` | One-time contributions, any status. |
| `fc.byProvider("github")` | Contributions on one provider. |
| `fc.direct()` | Contributions the user made themselves (excludes sponsorships paid by an [organization](/docs/concepts/organizations) they belong to). |
| `fc.toJSON()` | The plain [`ContributionResult`](/docs/reference/js/sdk/contributionresult) object. |

## Gating a feature

A typical check: "an active recurring contribution of at least $5 a month". Compare within one currency, and
decide whether organization sponsorships count:

```ts
import type { Contribution } from "@sponsorkit/sdk";
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-collective" });

function qualifies(c: Contribution): boolean {
  const monthly = c.frequency === "monthly" ? c.amount.value : c.frequency === "yearly" ? c.amount.value / 12 : 0;
  return c.amount.currency === "USD" && monthly >= 500;
}

const fc = await sk.getFinancialContribution();
const isSupporter = fc.active().some(qualifies);
```

Running this check in the browser is fine for cosmetic perks (hiding a banner, a badge). Anything a user could
gain from bypassing it belongs on your server: see [Backend verification](backend-verification.md).

## Stale results

`stale: true` means Sponsorkit couldn't confirm the data just now. The SDK still returns what it knew last, so
a supporter whose perks depend on it isn't locked out by an outage. Usually you can ignore `stale`; show a hint
if your UI displays contribution details. Read `unavailable` to see which provider was down.

## Cache lifetime

`cacheTtl` is set per client (minimum 60 seconds) and can be overridden per call. The cache is shared by every
client with the same targets and storage, so a second tab or a second process reuses it.

```ts
import { Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({ github: "octocat", cacheTtl: 6 * 3600 }); // a CLI can cache for hours

const fc = await sk.getFinancialContribution({ cacheTtl: 0 }); // always ask the API this time
```

`signIn()` and a completed `openCheckout()` refresh the cache themselves, so you don't need `cacheTtl: 0` after
them.
