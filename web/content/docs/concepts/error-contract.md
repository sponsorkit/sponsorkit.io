---
title: Error contract
description: How every SDK behaves when configuration is wrong, the network fails or a provider is down, and the error codes sign-in and verification can raise.
order: 70
---

Sponsorkit must never break your app. A sponsorship check is a nice-to-have, so an outage at Sponsorkit, GitHub
or Open Collective, a flaky network or a rate limit must not crash a CLI or blank a page. Every SDK behaves the
same way, and a shared conformance suite enforces it.

## What `getFinancialContribution()` does

| Situation | Behaviour |
|---|---|
| No targets or a malformed target | **Throws** `invalid_config`, from the constructor. |
| A target that doesn't exist (only with the [development check](../install/verify.md#check-your-targets) on) | **Throws** `invalid_config` on the first call. |
| Not signed in | Signed-out result, no network call. |
| `session_invalid` (expired or tampered token) | Clears the token and cache, returns the signed-out result. |
| One provider unavailable | Merges that provider's cached contributions, `stale: true`. |
| Network error, timeout, 5xx, rate limited | Returns the cache (`fromCache: true, stale: true`), or an empty signed-in result with `stale: true`. **Never throws.** |
| `SPONSORKIT_DISABLE=1` | No network or disk. `disabled: true`; `signIn` and `openCheckout` reject with `disabled`. |

So the only error a check can raise is `invalid_config`, which you see during development, not in your users'
hands. In Go and Rust the check returns an error value for the same reason; the result is always usable
otherwise. In .NET, cancelling its `CancellationToken` throws `OperationCanceledException` as usual.

Every HTTP request has a 30-second timeout (`requestTimeout`; `0` disables it, except in Go, where the zero value means the default and `sponsorkit.NoRequestTimeout` disables it). A timeout counts as a network
error: checks serve the cache, while sign-in fails with `network_error`.

## Error codes

Everything an SDK throws is a `SponsorkitError` (Go: `*sponsorkit.Error`, Rust: `sponsorkit::Error`) with one of
these codes:

| Code | Raised by | When |
|---|---|---|
| `invalid_config` | Constructor, any call | Missing or malformed targets or options; a target that doesn't exist (development check); `signIn()` couldn't save the session or `signOut()` couldn't clear it. |
| `disabled` | `signIn`, `openCheckout` | `SPONSORKIT_DISABLE` is set. |
| `popup_blocked` | `signIn`, `openCheckout` (browser SDK only) | The popup was blocked and no `returnTo` fallback is set. `openCheckout` opens its window before anything else, so it can raise this even when the user is already signed in. |
| `access_denied` | `signIn`, `openCheckout` (sign-in phase) | The supporter declined at GitHub or Open Collective. |
| `invalid_state`, `provider_error` | `signIn`, `openCheckout` (sign-in phase) | The sign-in expired or failed at the provider. |
| `invalid_code` | `signIn`, `openCheckout` (sign-in phase) | The API rejected the sign-in code (expired, or a mistyped paste-back code). |
| `cancelled` | `signIn`, `openCheckout` (sign-in phase) | The popup was closed or no paste-back code was entered. `signIn` also raises it when your cancellation fires; `openCheckout` resolves `{ status: "unknown" }` for that instead. |
| `timeout` | `signIn`, `openCheckout` (sign-in phase) | `signInTimeout` (default 5 minutes) passed. `openCheckout`'s own `timeout` bounds only the polling phase and resolves `{ status: "unknown" }`. |
| `network_error` | `signIn`, `openCheckout` (sign-in phase), `verifySession` | The API couldn't be reached, timed out, or answered 5xx, 429 or something unexpected. Carries `retryAfter` when the API sent `Retry-After`. |
| `session_invalid`, `targets_mismatch` | `verifySession` only | The token is invalid or expired, or was issued for other targets. |

`openCheckout()` signs the user in first when they aren't signed in yet, and raises the sign-in codes only
during that phase. It doesn't fail when nothing is detected afterwards: a polling timeout or cancellation
resolves `{ status: "unknown" }`. All five SDKs behave the same way. "Your cancellation" is the `signal`
(JavaScript), `CancellationToken` (.NET), `cancel` event (Python), `context.Context` (Go, including a deadline
on it) or `cancel` token (Rust) passed to the call. A closed popup, an empty paste-back code or an expired
`signInTimeout` still make `openCheckout` raise `cancelled` or `timeout`. The
[errors and offline guide](../guides/errors-and-offline.md#errors-that-are-thrown) has the full table with what to do about each code.

## Handling sign-in errors

Most apps only need to tell "the user walked away" from "try again later":

:::tabs
```ts
try {
  await sk.signIn();
} catch (e) {
  if (isSponsorkitError(e, "cancelled") || isSponsorkitError(e, "timeout")) return; // the user walked away
  if (e instanceof SponsorkitError && e.code === "network_error") {
    console.error(`Sponsorkit is unreachable; try again in ${e.retryAfter ?? 60} s`);
    return;
  }
  throw e;
}
```

```csharp
try
{
    await sk.SignInAsync();
}
catch (SponsorkitError e) when (e.Code is SponsorkitErrorCodes.Cancelled or SponsorkitErrorCodes.Timeout)
{
    // the user walked away
}
catch (SponsorkitError e) when (e.Code == SponsorkitErrorCodes.NetworkError)
{
    Console.Error.WriteLine($"Sponsorkit is unreachable; try again in {e.RetryAfter?.TotalSeconds ?? 60} s");
}
```

```python
try:
    sk.sign_in()
except SponsorkitError as e:
    if e.code in ("cancelled", "timeout"):
        return  # the user walked away
    if e.code == "network_error":
        print(f"Sponsorkit is unreachable; try again in {e.retry_after or 60} s")
        return
    raise
```

```go
_, err := sk.SignIn(ctx)
var e *sponsorkit.Error
switch {
case err == nil:
	return nil
case !errors.As(err, &e):
	return err
case e.Code == sponsorkit.CodeCancelled || e.Code == sponsorkit.CodeTimeout:
	return nil // the user walked away
case e.Code == sponsorkit.CodeNetworkError:
	wait := time.Minute
	if e.RetryAfter != nil {
		wait = *e.RetryAfter
	}
	fmt.Fprintf(os.Stderr, "Sponsorkit is unreachable; try again in %s\n", wait)
	return nil
default:
	return err
}
```

```rust
match sk.sign_in(SignInOptions::default()).await {
    Ok(_) => Ok(()),
    Err(e) if matches!(e.code(), ErrorCode::Cancelled | ErrorCode::Timeout) => Ok(()), // the user walked away
    Err(e) if e.code() == ErrorCode::NetworkError => {
        let wait = e.retry_after().unwrap_or(Duration::from_secs(60));
        eprintln!("Sponsorkit is unreachable; try again in {} s", wait.as_secs());
        Ok(())
    }
    Err(e) => Err(e),
}
```
:::

Go also offers `sponsorkit.ErrorCodeOf(err)`, which returns the code of any wrapped `*sponsorkit.Error`.

## Turning Sponsorkit off

Set `SPONSORKIT_DISABLE=1` (any non-empty value except `0` or `false`) and the SDK does nothing: no network, no
disk, `disabled: true` results, and nags never show. It's a good switch to document for your users, for
air-gapped machines or anyone who'd rather not see sponsorship features. It beats mock mode.
