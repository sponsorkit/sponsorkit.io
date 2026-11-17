---
title: Errors and cancellation in JavaScript / TypeScript
description: SponsorkitError and its codes, isSponsorkitError(), retryAfter, and cancelling with AbortSignal.
sidebar_label: Errors and cancellation
order: 80
---

The SDK is built so that Sponsorkit can never break your app: reading contributions doesn't throw because of
the network, and everything that can fail throws one documented error type. The language-neutral rules are in
the [error contract](/docs/concepts/error-contract).

## What throws, and what doesn't

| Call | On network or server problems | Throws or rejects with |
|---|---|---|
| `new Sponsorkit()` | n/a | `invalid_config` |
| `getFinancialContribution()` | Returns the cache with `stale: true` | only `invalid_config` from the dev-time target check |
| `isSignedIn()`, `getSessionToken()` | No network | nothing |
| `signIn()` | Rejects | `disabled`, `invalid_config`, `popup_blocked`, `access_denied`, `invalid_state`, `provider_error`, `invalid_code`, `cancelled`, `timeout`, `network_error` |
| `openCheckout()` | Keeps polling until `timeout` | the `signIn()` codes during sign-in, including `cancelled` when the user closes the popup or enters no code; only an aborted `signal` and the polling timeout resolve `{ status: "unknown" }` |
| `checkoutUrl()` | No network | `invalid_config` |
| `signOut()` | No network | `invalid_config` (storage not writable) |
| `nag()` | n/a | `invalid_config`; `due()` and `shown()` don't throw for network problems |
| `verifySession()` | Throws | `invalid_config`, `session_invalid`, `targets_mismatch`, `network_error` |

Background writes (refreshing the cache, counting nag runs) that fail are ignored, so a read-only home
directory or full `localStorage` degrades to "no cache" rather than an error. Only `signIn()` and `signOut()`,
which must persist the session, report a storage failure (as `invalid_config`).

## SponsorkitError

Every error the SDK throws is a `SponsorkitError`, a subclass of `Error`:

```ts
class SponsorkitError extends Error {
  /** Machine-readable error code. */
  readonly code: SponsorkitErrorCode;
  /** For network_error: seconds to wait before retrying, when the API sent Retry-After. */
  readonly retryAfter: number | undefined;
  constructor(code: SponsorkitErrorCode, message?: string, options?: { cause?: unknown; retryAfter?: number });
}
```

Its `name` is `"SponsorkitError"`, and `cause` holds the underlying error when there is one (for example the
`fetch` failure behind a `network_error`).

| Code | Meaning |
|---|---|
| `invalid_config` | Missing or malformed targets or options; a target that doesn't exist (dev-time check); the session couldn't be saved or cleared. |
| `disabled` | `signIn()` or `openCheckout()` while `SPONSORKIT_DISABLE` is set. |
| `popup_blocked` | Browser only: the popup was blocked and there is no `returnTo`. |
| `access_denied` | The user declined on the provider's consent screen. |
| `invalid_state` | The sign-in state was invalid or had expired, for example because the consent page was left open too long. |
| `provider_error` | The provider or Sponsorkit reported another sign-in error (or, on Node with `signInMethod: "loopback"`, the receiver couldn't start). |
| `invalid_code` | Sponsorkit rejected the sign-in code, e.g. a mistyped paste-back code. |
| `cancelled` | The popup was closed, no code was entered, or your `AbortSignal` aborted. |
| `timeout` | Sign-in took longer than `signInTimeout`. |
| `network_error` | Sponsorkit couldn't be reached, timed out (`requestTimeout`), or answered 5xx, 429 or something unexpected, during `signIn()` or `verifySession()`. |
| `session_invalid` | `verifySession()`: the token is missing, malformed, expired or revoked. |
| `targets_mismatch` | `verifySession()`: the token belongs to a different target set. |

The codes are the same in every Sponsorkit SDK. `SPONSORKIT_ERROR_CODES` lists them, and the
`SponsorkitErrorCode` type is their union.

## Handling errors

Use `isSponsorkitError(e, code?)` to narrow an `unknown` caught value to `SponsorkitError` (optionally with a
given code). It is an `instanceof` check, so make sure your app loads one copy of the SDK: if a bundle ends up
with both the ESM and the CommonJS build, errors from one aren't instances of the other's class.

```ts
import { isSponsorkitError, Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({ github: "octocat", appName: "my-cli" });

try {
  await sk.signIn();
} catch (e) {
  if (!isSponsorkitError(e)) throw e;
  switch (e.code) {
    case "cancelled":
    case "timeout":
      console.error("Sign-in abandoned.");
      break;
    case "access_denied":
      console.error("You declined access; nothing was shared.");
      break;
    case "network_error":
      console.error(`Can't reach Sponsorkit${e.retryAfter ? `; retry in ${e.retryAfter}s` : ""}.`);
      break;
    default:
      console.error(`Sign-in failed (${e.code}): ${e.message}`);
  }
}
```

`retryAfter` is only set for `network_error`, when the API sent a `Retry-After` header (capped at 86400
seconds). `getFinancialContribution()` honours `Retry-After` on its own by serving the cache until then.

## Cancellation

The SDK uses the standard `AbortSignal`, so it composes with `AbortController`, `AbortSignal.timeout()` and
`AbortSignal.any()`:

| Call | Option | On abort |
|---|---|---|
| `signIn()` | `signal` | Rejects with `cancelled`. |
| `openCheckout()` | `signal` | Resolves `{ status: "unknown" }`, during sign-in or while waiting. (A popup the user closes during sign-in rejects with `cancelled`.) |
| `verifySession()` | `signal` | The request is aborted and the call rejects with `network_error`. |

```ts
import { isSponsorkitError, Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat" });
const controller = new AbortController();

document.querySelector("#sponsor")?.addEventListener("click", async () => {
  try {
    // "unknown" if the controller aborts, during sign-in or while waiting.
    const result = await sk.openCheckout({ signal: controller.signal });
    console.log(result.status);
  } catch (e) {
    // Closing the popup before signing in is not an abort: it still rejects with "cancelled".
    if (!isSponsorkitError(e, "cancelled")) console.error(e);
  }
});
// e.g. when the user navigates away inside your single-page app:
document.querySelector("#cancel")?.addEventListener("click", () => controller.abort());
```

Aborting a browser sign-in closes the popup. `getFinancialContribution()` takes no signal: it is bounded by
`requestTimeout` (30 seconds by default) and then falls back to the cache.

## Mock and disabled modes

In mock mode nothing touches the network, so the only errors are `invalid_config` ones. With
`SPONSORKIT_DISABLE` set, reads return empty `disabled: true` results and `signIn()` and `openCheckout()` reject
with `disabled`, so code paths that offer sign-in should check `sk.disabled` first.
