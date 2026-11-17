---
title: Handle errors and offline
description: Which calls can fail and with which codes, why reading contributions never throws, and how stale data, Retry-After and expired sign-ins are reported.
order: 80
---

Sponsorkit is built so that adding it can't break your app. Reading contributions never fails because of the
network, Sponsorkit or a provider. The calls where a person is waiting for an answer (sign-in, checkout, backend
verification) do report errors, with a stable code that's the same in every SDK.

## Reading contributions never throws

`getFinancialContribution()` doesn't throw for network errors, timeouts, server errors or rate limits. Instead:

| Situation | Result |
|---|---|
| Not signed in | Signed-out result (`signedIn: false`). No network call. |
| Cache younger than `cacheTtl` | The cached result, `fromCache: true`. No network call. |
| Fresh answer from the API | The live result, `fromCache: false`. It replaces the cache. |
| Network error, timeout, 5xx or `429` | The cached result with `fromCache: true` and `stale: true`. With no cache yet: a signed-in result with no contributions, `supporter: null` and `stale: true`. |
| One provider unreachable | Live data from the other provider, plus the cached contributions of the unreachable one; `stale: true`. |
| Session rejected (`session_invalid`) | The stored token and cache are cleared; signed-out result. |
| `SPONSORKIT_DISABLE` set | Signed-out result with `disabled: true`. No network or disk. |

The one exception is configuration: a malformed target fails with `invalid_config` when you construct the client,
and when [dev checks](mock-mode.md#environment-variables) are on, a target that doesn't exist fails the first call
with `invalid_config`. Both are bugs to fix during development, never something that happens to your users.

In .NET, cancelling the `CancellationToken` you pass to `GetFinancialContributionAsync` throws the usual
`OperationCanceledException`.

### Showing stale data

`stale: true` means "this may be out of date": at least part of the result couldn't be refreshed. `fromCache`
tells you the whole result came from the local cache, and `fetchedAt` is when the data was fetched from the API
(`null` if never). Most apps can ignore all three and use the result as is. If you show sponsorship status
prominently, you can mention it:

:::tabs
```ts title="status.ts"
import { Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-project", appName: "my-cli" });

const fc = await sk.getFinancialContribution();
if (!fc.signedIn) {
  console.log("Not signed in. Run `my-cli login` if you sponsor my-cli.");
} else {
  console.log(`Active sponsorships: ${fc.active().length}`);
  if (fc.stale) console.log(`(Couldn't reach Sponsorkit. Last update: ${fc.fetchedAt ?? "never"}.)`);
  for (const identity of fc.supporter?.identities ?? []) {
    if (identity.needsReconnect) console.log(`Please sign in to ${identity.provider} again: my-cli login`);
  }
}
```
```csharp title="Status.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", OpenCollective = "my-project", AppName = "my-cli" });

var fc = await sk.GetFinancialContributionAsync();
if (!fc.SignedIn)
{
    Console.WriteLine("Not signed in. Run `my-cli login` if you sponsor my-cli.");
}
else
{
    Console.WriteLine($"Active sponsorships: {fc.Active().Count}");
    if (fc.Stale) Console.WriteLine($"(Couldn't reach Sponsorkit. Last update: {fc.FetchedAt?.ToString() ?? "never"}.)");
    foreach (var identity in fc.Supporter?.Identities ?? [])
    {
        if (identity.NeedsReconnect) Console.WriteLine($"Please sign in to {identity.Provider} again: my-cli login");
    }
}
```
```python title="status.py"
from sponsorkit import Sponsorkit

sk = Sponsorkit(github="octocat", opencollective="my-project", app_name="my-cli")

fc = sk.get_financial_contribution()
if not fc.signed_in:
    print("Not signed in. Run `my-cli login` if you sponsor my-cli.")
else:
    print(f"Active sponsorships: {len(fc.active())}")
    if fc.stale:
        print(f"(Couldn't reach Sponsorkit. Last update: {fc.fetched_at or 'never'}.)")
    for identity in fc.supporter.identities if fc.supporter else ():
        if identity.needs_reconnect:
            print(f"Please sign in to {identity.provider} again: my-cli login")
```
```go title="main.go"
package main

import (
	"context"
	"fmt"
	"log"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", OpenCollective: "my-project", AppName: "my-cli"})
	if err != nil {
		log.Fatal(err)
	}

	fc, err := sk.GetFinancialContribution(context.Background())
	if err != nil {
		log.Fatal(err) // only invalid_config from the dev-time check
	}
	if !fc.SignedIn {
		fmt.Println("Not signed in. Run `my-cli login` if you sponsor my-cli.")
		return
	}
	fmt.Println("Active sponsorships:", len(fc.Active()))
	if fc.Stale {
		last := "never"
		if fc.FetchedAt != nil {
			last = *fc.FetchedAt
		}
		fmt.Printf("(Couldn't reach Sponsorkit. Last update: %s.)\n", last)
	}
	if fc.Supporter != nil {
		for _, id := range fc.Supporter.Identities {
			if id.NeedsReconnect {
				fmt.Printf("Please sign in to %s again: my-cli login\n", id.Provider)
			}
		}
	}
}
```
```rust title="main.rs"
use sponsorkit::{GetOptions, Options, Sponsorkit};

#[tokio::main]
async fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        opencollective: Some("my-project".into()),
        app_name: Some("my-cli".into()),
        ..Default::default()
    })?;

    let fc = sk.get_financial_contribution(GetOptions::default()).await?;
    if !fc.signed_in {
        println!("Not signed in. Run `my-cli login` if you sponsor my-cli.");
        return Ok(());
    }
    println!("Active sponsorships: {}", fc.active().len());
    if fc.stale {
        println!("(Couldn't reach Sponsorkit. Last update: {}.)", fc.fetched_at.as_deref().unwrap_or("never"));
    }
    for identity in fc.supporter.iter().flat_map(|s| &s.identities) {
        if identity.needs_reconnect {
            println!("Please sign in to {} again: my-cli login", identity.provider);
        }
    }
    Ok(())
}
```
:::

### Expired provider sign-ins

An Open Collective sign-in expires after 90 days, and a person can revoke Sponsorkit's access on GitHub or Open
Collective at any time. Sponsorkit then marks that identity `needsReconnect: true`, lists its provider in
`unavailable` with `stale: true`, and the SDK keeps serving that provider's cached contributions. The rest of the session keeps working.
To fix it, call `signIn({ provider })` with that provider: it replaces the expired identity in the same session.

## Rate limits and `Retry-After`

The API allows one refresh per minute per session. A request inside that window gets `429` with a `Retry-After`
header, and the SDK:

- serves the cache, as for any network problem;
- remembers the back-off **for the rest of the process**, so later calls don't even try until it has passed,
  even with `cacheTtl: 0`;
- ignores values it can't use and caps the rest at 24 hours, so a broken header can't stall your app.

With the default `cacheTtl` of one hour you'll rarely see this. It mostly matters if you refresh with
`cacheTtl: 0` in a loop.

## Timeouts

Every HTTP request has a 30-second timeout. Change it with `requestTimeout` (seconds in JavaScript and Python,
`RequestTimeout` as a `TimeSpan`/`time.Duration` in .NET and Go, `request_timeout` as a `Duration` in Rust).
`0` disables it, except in Go, where the zero value means the default and `sponsorkit.NoRequestTimeout` disables
it. A timeout counts as a network error: reading serves the cache, and sign-in or verification fails with
`network_error`.

## Errors that are thrown

Every error the SDKs throw is a `SponsorkitError` (`*sponsorkit.Error` in Go, `sponsorkit::Error` in Rust) with a
`code`:

| Code | Thrown by | Meaning and what to do |
|---|---|---|
| `invalid_config` | constructor, any call | Missing or malformed targets or options, an unknown mock preset, a target that doesn't exist (dev check), or storage that can't be written when signing in or out. Fix the configuration. |
| `disabled` | `signIn`, `openCheckout` | `SPONSORKIT_DISABLE` is set. Hide or disable your sign-in UI. |
| `popup_blocked` | `signIn`, `openCheckout` (browser) | The popup was blocked and there's no [redirect fallback](web-app.md#when-the-popup-is-blocked-the-redirect-fallback). |
| `access_denied` | `signIn` | The person declined at GitHub or Open Collective. Nothing to report. |
| `invalid_state` | `signIn` | The sign-in took too long at the provider (over 10 minutes). Try again. |
| `provider_error` | `signIn` | The provider failed during sign-in. Try again later. |
| `invalid_code` | `signIn` | The sign-in code was rejected: expired, mistyped when pasted, or from another attempt. Try again. |
| `cancelled` | `signIn` | The person closed the popup, entered no code, or you cancelled. |
| `timeout` | `signIn`, `openCheckout` | Sign-in took longer than `signInTimeout` (300 s). |
| `network_error` | `signIn`, `openCheckout`, `verifySession` | Sponsorkit couldn't be reached, timed out, or answered 5xx, `429` or something unexpected. Has `retryAfter` (seconds) when the API sent `Retry-After`. Retry later. |
| `session_invalid` | `verifySession` | The token is missing, expired, tampered with or otherwise invalid. |
| `targets_mismatch` | `verifySession` | The token was issued for different targets. |

The codes and their meanings are part of the wire protocol, so they're identical across languages. The field is
`code` in JavaScript and Python, `Code` in .NET and Go, and `code()` (an `ErrorCode` enum, with `as_str()` for
the string) in Rust. In Go, `sponsorkit.ErrorCodeOf(err)` returns the code of any error, or `""` for `nil`.

`openCheckout()` follows the same rules for its sign-in phase, but cancellation and the polling timeout resolve
`{ status: "unknown" }` instead of throwing. See [checkout](checkout.md#timeouts-and-cancellation).

The [error contract](../concepts/error-contract.md) page explains the design behind these rules.
