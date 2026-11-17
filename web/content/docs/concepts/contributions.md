---
title: Contribution shape
description: The result every SDK returns, field by field, how each language names the fields, and the helpers that filter it.
order: 30
---

`getFinancialContribution()` returns the same data in every SDK. It's raw: one entry per sponsorship or order,
per provider, in the provider's own currency. Sponsorkit never sums, converts or ranks contributions, because
only you know what should count.

```jsonc title="ContributionResult"
{
  "signedIn": true,
  "disabled": false,
  "mock": false,
  "targets": ["github:octocat", "opencollective:my-collective"],
  "supporter": {
    "id": "sup_…",
    "identities": [{ "provider": "github", "id": "583231", "handle": "alice", "needsReconnect": false }]
  },
  "contributions": [{
    "id": "con_github_…",
    "provider": "github",
    "target": "github:octocat",
    "sponsor": { "type": "user", "provider": "github", "id": "583231", "handle": "alice" },
    "via": "direct",
    "kind": "recurring",
    "frequency": "monthly",
    "status": "active",
    "amount": { "value": 500, "currency": "USD" },
    "tier": { "id": "ST_…", "name": "Coffee" },
    "flags": [],
    "private": false,
    "startedAt": "2026-03-01T10:00:00Z",
    "endedAt": null,
    "lastChargedAt": null,
    "nextChargeAt": null,
    "totalContributed": null
  }],
  "fetchedAt": "2026-11-16T18:00:00Z",
  "stale": false,
  "fromCache": false
}
```

## The result

| Field | Type | Meaning |
|---|---|---|
| `signedIn` | boolean | A session token is stored. `false` means no network call was made. |
| `disabled` | boolean | `SPONSORKIT_DISABLE` is set: no network, no disk, always signed out. |
| `mock` | boolean | The result comes from [mock mode](../guides/mock-mode.md). |
| `targets` | string[] | The canonical target set, such as `github:octocat`. |
| `supporter` | object or null | `null` when signed out. See [the supporter](#the-supporter). |
| `contributions` | Contribution[] | Contributions to your targets, from both providers. Empty when signed out. |
| `fetchedAt` | timestamp or null | When the API produced this data. `null` when nothing was fetched yet. |
| `stale` | boolean | Some provider couldn't be reached and its data, if any, comes from the local cache. |
| `fromCache` | boolean | The whole result came from the local cache: either it was fresh, or the request failed. |
| `unavailable` | provider[], optional | Present on fresh API results when a provider couldn't be queried. |

When signed out, disabled or in a mock preset without a supporter, `supporter` is `null` and `contributions` is
empty. [Caching & freshness](caching.md) explains `stale` and `fromCache`.

### The supporter

| Field | Meaning |
|---|---|
| `supporter.id` | `sup_…`, a pairwise id: stable for the same person and the same target set, and different for apps with other targets, so apps can't correlate users. Derived from the session's first identity. |
| `identities[].provider` | `github` or `opencollective`. |
| `identities[].id` | The provider's immutable user id. |
| `identities[].handle` | The login or slug, or `null`. Handles can change; key your data on `supporter.id` or `id`. |
| `identities[].needsReconnect` | The provider permission expired or was revoked; see [reconnecting](sessions.md#reconnecting-an-identity). |

## A contribution

| Field | Values | Meaning |
|---|---|---|
| `id` | `con_<provider>_…` | Stable, derived from the provider's own id. |
| `provider` | `github`, `opencollective` | Where the contribution was made. |
| `target` | e.g. `github:octocat` | Which of your targets it goes to. |
| `sponsor` | `{ type, provider, id, handle }` | Who pays: `type` is `user`, or `organization` for [organization sponsorships](organizations.md). |
| `via` | `direct`, `organization` | Whether the supporter pays personally or through an organization. |
| `kind` | `recurring`, `one_time` | |
| `frequency` | `monthly`, `yearly`, `one_time` | GitHub has monthly and one-time; Open Collective also has yearly. |
| `status` | `active`, `paused`, `cancelled`, `paid`, `refunded`, `disputed`, `failed`, `pending` | See [statuses](statuses.md). |
| `amount` | `{ value, currency }` | Per charge, in **minor units**: `500` with `USD` is $5.00. |
| `tier` | `{ id, name }` or `null` | The provider's tier, when there is one. |
| `flags` | `["via_patreon"]` or `[]` | `via_patreon`: a GitHub sponsorship paid through Patreon. |
| `private` | boolean | The supporter made it private (GitHub) or incognito (Open Collective). Your app sees it because the supporter consented; don't display it publicly. |
| `startedAt`, `endedAt` | timestamp or `null` | ISO 8601. |
| `lastChargedAt`, `nextChargeAt` | timestamp or `null` | Open Collective only. |
| `totalContributed` | `{ value, currency }` or `null` | Open Collective only: everything paid so far. |

### Amounts

- **Minor units** follow ISO 4217: two decimals for most currencies, none for `JPY` or `KRW`, three for `KWD`.
  Divide by the right power of ten before showing an amount.
- **GitHub is always `USD`.** Open Collective uses the collective's currency.
- **Hidden GitHub amounts.** When GitHub doesn't reveal the tier, `amount` is `{ value: 0, currency: "USD" }` and
  `tier` is `null`. Rules like "at least $5" then treat the sponsorship as $0, so decide whether "any active
  GitHub sponsorship" should count too.

## Names in each language

The JSON field names are the wire format, and every SDK serializes back to exactly this shape. In code, each SDK
follows its language's conventions:

| JSON | JavaScript | .NET | Python | Go | Rust |
|---|---|---|---|---|---|
| `signedIn` | `signedIn` | `SignedIn` | `signed_in` | `SignedIn` | `signed_in` |
| `fromCache` | `fromCache` | `FromCache` | `from_cache` | `FromCache` | `from_cache` |
| `amount.value` | `amount.value` | `Amount.Value` (long) | `amount.value` | `Amount.Value` (int64) | `amount.value` (i64) |
| `private` | `private` | `IsPrivate` | `private` | `Private` | `private` |
| `sponsor.type` | `sponsor.type` | `Sponsor.Type` | `sponsor.type` | `Sponsor.Type` | `sponsor.kind` |
| `startedAt` | string | `DateTimeOffset?` | `str` | `*string` | `Option<String>` |
| `status` | string union | string, `ContributionStatuses.*` | `Literal` string | `sponsorkit.Status*` | `Status` enum |

Nullable strings such as `handle` are `string | null`, `string?`, `str | None`, `*string` and `Option<String>`.
The Rust enums `Status` and `Flag` have an `Other(String)` variant, so a value added to the protocol later won't
break deserialization.

## Helpers

The result has five filters. They only filter; they never sum across providers or currencies.

| Helper | Keeps |
|---|---|
| `active()` | `status` is `active` |
| `recurring()` | `kind` is `recurring`, any status |
| `oneTime()` | `kind` is `one_time`, any status |
| `byProvider(p)` | One provider |
| `direct()` | `via` is `direct`: drops organization sponsorships |

Each returns a plain list, so combine them with your language's own filtering:

:::tabs
```ts
const fc = await sk.getFinancialContribution();

// Your rule: at least $5 on any active USD contribution.
const isSupporter = fc.active().some((c) => c.amount.currency === "USD" && c.amount.value >= 500);
const githubOnly = fc.byProvider("github");
const everPaid = fc.oneTime().some((c) => c.status === "paid");
```

```csharp
var fc = await sk.GetFinancialContributionAsync();

// Your rule: at least $5 on any active USD contribution.
var isSupporter = fc.Active().Any(c => c.Amount.Currency == "USD" && c.Amount.Value >= 500);
var githubOnly = fc.ByProvider(Providers.GitHub);
var everPaid = fc.OneTime().Any(c => c.Status == ContributionStatuses.Paid);
```

```python
fc = sk.get_financial_contribution()

# Your rule: at least $5 on any active USD contribution.
is_supporter = any(c.amount.currency == "USD" and c.amount.value >= 500 for c in fc.active())
github_only = fc.by_provider("github")
ever_paid = any(c.status == "paid" for c in fc.one_time())
```

```go
fc, err := sk.GetFinancialContribution(ctx)
if err != nil {
	return err
}

// Your rule: at least $5 on any active USD contribution.
isSupporter := false
for _, c := range fc.Active() {
	if c.Amount.Currency == "USD" && c.Amount.Value >= 500 {
		isSupporter = true
	}
}
githubOnly := fc.ByProvider(sponsorkit.GitHub)
```

```rust
let fc = sk.get_financial_contribution(GetOptions::default()).await?;

// Your rule: at least $5 on any active USD contribution.
let is_supporter = fc.active().iter().any(|c| c.amount.currency == "USD" && c.amount.value >= 500);
let github_only = fc.by_provider(Provider::GitHub);
let ever_paid = fc.one_time().iter().any(|c| c.status == Status::Paid);
```
:::

Each SDK's API reference lists the exact types: [JavaScript](/docs/reference/js), [.NET](/docs/reference/dotnet),
[Python](/docs/reference/python), [Go](/docs/reference/go) and [Rust](/docs/reference/rust).
