---
title: Caching & freshness
description: The SDK is the cache. How long results are reused, what stale and fromCache mean, and how rate limits and outages are absorbed.
order: 60
---

Sponsorkit has no database, so the SDK is the cache. Each result is stored on the supporter's device and served
again, without any network call, for `cacheTtl` seconds. A cache miss is a live query to GitHub or Open
Collective with the supporter's own permission, which typically takes 0.3 to 1 second.

Two reasons to cache: your app stays fast and works offline, and the providers aren't asked the same question
on every run.

## Setting the TTL

The default is one hour. A value below 60 seconds is raised to 60. A single call can ask for fresher data, down
to `0`, which always asks the API:

:::tabs
```ts
const sk = new Sponsorkit({ github: "octocat", cacheTtl: 6 * 3600 }); // seconds, minimum 60

await sk.getFinancialContribution();                               // cached for up to 6 hours
const fresh = await sk.getFinancialContribution({ cacheTtl: 0 }); // ask the API now
```

```csharp
var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", CacheTtl = TimeSpan.FromHours(6) });

await sk.GetFinancialContributionAsync();                          // cached for up to 6 hours
var fresh = await sk.GetFinancialContributionAsync(TimeSpan.Zero); // ask the API now
```

```python
sk = Sponsorkit(github="octocat", cache_ttl=6 * 3600)  # seconds, minimum 60

sk.get_financial_contribution()  # cached for up to 6 hours
fresh = sk.get_financial_contribution(cache_ttl=0)  # ask the API now
```

```go
sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", CacheTTL: 6 * time.Hour})
if err != nil {
	return err
}
_, _ = sk.GetFinancialContribution(ctx)                                  // cached for up to 6 hours
fresh, _ := sk.GetFinancialContribution(ctx, sponsorkit.WithCacheTTL(0)) // ask the API now
```

```rust
let sk = Sponsorkit::new(Options {
    github: Some("octocat".into()),
    cache_ttl: Some(Duration::from_secs(6 * 3600)), // minimum 60 s
    ..Default::default()
})?;

sk.get_financial_contribution(GetOptions::default()).await?; // cached for up to 6 hours
let fresh = sk.get_financial_contribution(GetOptions::fresh()).await?; // ask the API now
```
:::

Choosing a value:

- **CLIs** that run many times a day are well served by the default: at most one request per hour.
- **Long-running apps** can call `getFinancialContribution()` whenever they need the answer; it's a local read
  until the TTL passes.
- **Don't force `0` on every start.** The API allows one refresh per minute per session; faster calls get the
  cache back (see below).

A new or cancelled sponsorship shows up within `cacheTtl`. After a checkout you don't have to wait: `openCheckout()`
polls with a TTL of 0 until the new contribution appears; see the [checkout guide](../guides/checkout.md).

## `fromCache` and `stale`

Two flags tell you where a result came from:

- **`fromCache: true`**: the whole result was read from the local cache; no request was made, or the request
  failed.
- **`stale: true`**: some data may be out of date, because a provider (or the whole API) couldn't be reached.

| Situation | `fromCache` | `stale` | Contributions |
|---|---|---|---|
| Fresh cache hit | `true` | As stored | From the cache |
| Successful refresh | `false` | `false` | Live |
| One provider unavailable | `false` | `true` | Live, plus that provider's from the cache |
| Network error, 5xx or rate limited, with a cache | `true` | `true` | From the cache, whatever its age |
| Same, with nothing cached | `false` | `true` | None: `signedIn: true`, `supporter: null` |

You rarely need to act on these flags. They're useful for a "last checked" hint in a UI, or for being lenient:
for example, keep showing a supporter badge while `stale` is true rather than taking it away during an outage.

## Rate limits and `Retry-After`

The API refreshes each session at most once per minute. A faster refresh gets `429` with a `Retry-After` header,
and the SDK serves the cache. Until that time passes, the SDK doesn't call the API for that target set from the
same process, even with a TTL of 0. `Retry-After` values are capped at 24 hours.

Provider quotas are per supporter (GitHub allows 5,000 requests an hour and Open Collective 100 a minute), so
normal use is far below them.

## When the cache is written and cleared

- **Sign-in** stores its first result as the cache, so the next check is instant.
- **Every successful refresh** replaces the cache, and stores a renewed session token if the API sent one.
- **Concurrent processes** don't undo each other: a refresh writes back only if the stored session token is still
  the one it used, so a sign-out or new sign-in in another process wins.
- **Sign-out** and a rejected (`session_invalid`) token delete the token and the cache. Nag counters are kept.
- **Mock and disabled modes** never touch the cache or the disk.

Where the cache lives on each platform is listed under
[supported platforms](../install/supported-platforms.md#where-state-is-stored).
