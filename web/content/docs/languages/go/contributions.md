---
title: Reading contributions in Go
description: GetFinancialContribution, the Result and Contribution types, the filter helpers, writing your own rule, and caching.
sidebar_label: Contributions
order: 30
---

`GetFinancialContribution` answers "what has the current user contributed to my targets?". It is safe to call
on every run: it never prompts, never fails because of the network, and serves a local cache for an hour by
default.

```go
func (c *Client) GetFinancialContribution(ctx context.Context, opts ...GetOption) (*Result, error)
```

The only error it returns is `invalid_config`, from the opt-in [dev-time target check](configuration.md#the-dev-time-target-check).
Network failures, 5xx responses and rate limits give you the cached result instead; see
[what happens offline](#offline-and-stale-results).

## The Result

`*sponsorkit.Result` mirrors the protocol's [result shape](../../concepts/contributions.md#the-result), and
`json.Marshal` produces exactly that JSON.

| Field | Type | Meaning |
|---|---|---|
| `SignedIn` | `bool` | A session token is stored. When false, no request was made. |
| `Disabled` | `bool` | `SPONSORKIT_DISABLE` is set. |
| `Mock` | `bool` | The result comes from [mock mode](testing.md). |
| `Targets` | `[]string` | Your canonical targets, such as `github:octocat`. |
| `Supporter` | `*Supporter` | `ID` (pairwise `sup_…`) and `Identities`; nil when signed out. |
| `Contributions` | `[]Contribution` | Contributions to your targets, from both providers. Empty when signed out. |
| `FetchedAt` | `*string` | When the API produced the data (ISO 8601), or nil. |
| `Stale` | `bool` | Some provider couldn't be reached; its data, if any, comes from the cache. |
| `FromCache` | `bool` | The whole result came from the local cache, without a request. |
| `Unavailable` | `[]Provider` | Providers the API couldn't query when this result was fetched; kept when the result is served from the cache. |

Each `sponsorkit.Contribution` has `ID`, `Provider`, `Target`, `Sponsor`, `Via`, `Kind`, `Frequency`, `Status`,
`Amount` (`Value` in minor units as `int64`, and `Currency`), `Tier`, `Flags`, `Private` and the timestamps
`StartedAt`, `EndedAt`, `LastChargedAt`, `NextChargeAt`, plus `TotalContributed`. Optional values are pointers.
The enum-like fields have typed constants: `sponsorkit.StatusActive`, `sponsorkit.KindRecurring`,
`sponsorkit.Monthly`, `sponsorkit.ViaOrganization`, `sponsorkit.GitHub` and so on. The
[API reference](/docs/reference/go/contribution) documents every field, and [statuses](../../concepts/statuses.md)
explains what each status means for each provider.

## Helpers

`*Result` has five filters. Each returns a new `[]Contribution` (never nil); none of them sums amounts across
providers or currencies.

| Method | Keeps |
|---|---|
| `Active()` | `Status == StatusActive` |
| `Recurring()` | `Kind == KindRecurring`, any status |
| `OneTime()` | `Kind == KindOneTime`, any status |
| `ByProvider(p)` | `Provider == p` |
| `Direct()` | `Via == ViaDirect`: drops organization sponsorships |

## Writing your rule

Sponsorkit reports facts; deciding who counts as a sponsor is up to you. Put the rule in one function so you can
[unit-test it with mock mode](testing.md#unit-testing-your-rule):

```go title="rule.go"
package main

import sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"

// isSponsor: at least $5 a month, paid personally or by an organization, or any
// one-time payment of $25 or more.
func isSponsor(fc *sponsorkit.Result) bool {
	for _, c := range fc.Active() {
		if c.Amount.Currency == "USD" && c.Amount.Value >= 500 {
			return true
		}
	}
	for _, c := range fc.OneTime() {
		if c.Status == sponsorkit.StatusPaid && c.Amount.Currency == "USD" && c.Amount.Value >= 2500 {
			return true
		}
	}
	return false
}
```

Things to decide for your rule:

- **Currencies.** GitHub is always USD; Open Collective uses the collective's currency. Amounts are in minor units
  (`500` with `USD` is $5.00), so compare per currency rather than adding them up.
- **Hidden GitHub amounts.** When GitHub doesn't reveal the tier, the amount is `0` USD. Decide whether any active
  GitHub sponsorship should count; see [amounts](../../concepts/contributions.md#amounts).
- **Organizations.** Use `Direct()` to ignore sponsorships paid by an organization the user belongs to; see
  [organization sponsorships](../../concepts/organizations.md).
- **One-time payments** are never `active`: a completed one is `paid`.
- **Private contributions** are included because the supporter consented, but don't display them publicly.

## Caching

The result is cached in the state file for `Options.CacheTTL` (one hour by default, at least one minute). Within
that time `GetFinancialContribution` makes no request and returns the cached result with `FromCache` set. To
refresh, for example right after the user says they've just sponsored, pass `WithCacheTTL(0)`:

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
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat"})
	if err != nil {
		log.Fatal(err)
	}
	fc, err := sk.GetFinancialContribution(ctx, sponsorkit.WithCacheTTL(0))
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("fresh:", !fc.FromCache, "active:", len(fc.Active()))
}
```

When signed out, nothing is requested and the result is the signed-out shape, so calling it at startup costs
nothing for users who never signed in. [Caching & freshness](../../concepts/caching.md) covers the details shared
by all SDKs.

## Offline and stale results

`GetFinancialContribution` is built so that Sponsorkit can't break your program:

| Situation | Result |
|---|---|
| Network error, timeout, 5xx or unexpected response | The cached result with `FromCache` and `Stale` set; with no cache, a signed-in result with no contributions and `Stale` set. |
| `429` (rate limited) | As above, and this process makes no further request for this target set until the `Retry-After` time has passed (60 seconds when the API sent none). |
| One provider unavailable | A fresh result with `Stale` set and that provider in `Unavailable`; its contributions come from the cache. |
| The session was rejected (`401`) | The user is signed out locally and gets the signed-out result. |
| `SPONSORKIT_DISABLE` set | `Disabled` set, signed out, no network and no disk. |

So "signed in, stale, no contributions" means "we don't know right now". If you gate features, decide whether to
give the benefit of the doubt; the [errors and offline guide](../../guides/errors-and-offline.md) has patterns.

## Signed-in state without a request

`IsSignedIn()` tells you whether a session is stored, without any I/O beyond reading the state file. Use it to
decide whether to show "Sign in" or "Sign out" in your UI before calling anything else.
