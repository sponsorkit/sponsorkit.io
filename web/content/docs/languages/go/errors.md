---
title: Errors and cancellation in Go
description: The *sponsorkit.Error type and its codes, errors.As, errors.Is and ErrorCodeOf, RetryAfter, and cancelling with context.Context.
sidebar_label: Errors and cancellation
order: 80
---

The SDK is built so that Sponsorkit can never break your program: reading contributions doesn't fail because of
the network, and everything else returns ordinary Go error values with a machine-readable code.
The [error contract](../../concepts/error-contract.md) is the same in every language.

## The error type

Every error returned by `New`, the `Client` methods, `VerifySession`, `TargetsParam`/`TargetsHash` and
`ParseISODuration` is a `*sponsorkit.Error` (shown here with its fields' meaning). The pluggable helpers
`OpenSystemBrowser`, `PromptStdin` and `DirStorage` are the exception: they return ordinary errors, and the SDK
converts them where it calls them.

```go
type Error struct {
	Code       ErrorCode      // machine-readable, e.g. sponsorkit.CodeTimeout ("timeout")
	Message    string         // human-readable
	Err        error          // the underlying cause, if any (e.g. context.Canceled)
	RetryAfter *time.Duration // set for a network_error when the API sent Retry-After
}
```

Its `Error()` string reads `sponsorkit: <code>: <message>`, followed by `: <cause>` when `Err` is set. `Unwrap`
returns `Err`, so `errors.Is(err, context.Canceled)` and `errors.Is(err, context.DeadlineExceeded)` work through
it.

Three ways to check a code:

```go title="main.go"
package main

import (
	"context"
	"errors"
	"fmt"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", Env: map[string]string{"SPONSORKIT_DISABLE": "1"}})
	if err != nil {
		panic(err)
	}
	_, err = sk.SignIn(context.Background())

	// 1. errors.As, when you also want Message, Err or RetryAfter.
	var skErr *sponsorkit.Error
	if errors.As(err, &skErr) && skErr.Code == sponsorkit.CodeDisabled {
		fmt.Println("disabled:", skErr.Message)
	}

	// 2. ErrorCodeOf returns the code, or "" for nil and for non-Sponsorkit errors.
	switch sponsorkit.ErrorCodeOf(err) {
	case "":
		fmt.Println("ok")
	case sponsorkit.CodeDisabled:
		fmt.Println("Sponsorkit is turned off on this machine")
	}

	// 3. errors.Is with a code-only *Error as the target.
	if errors.Is(err, &sponsorkit.Error{Code: sponsorkit.CodeDisabled}) {
		fmt.Println("still disabled")
	}
}
```

These work on wrapped errors too, so you can add context with `fmt.Errorf("login: %w", err)` and still check the
code later.

## Error codes

| Code | Constant | Returned by |
|---|---|---|
| `invalid_config` | `CodeInvalidConfig` | `New` (malformed targets, `AppName` over 64 characters, a bad `APIBaseURL`, negative durations, an unknown `SignInMethod` or mock preset); `CheckoutURL`/`OpenCheckout` (bad checkout options); `SignIn` (provider not among your targets, or the session can't be stored); `SignOut` (storage can't be written); `GetFinancialContribution`, `SignIn`, `OpenCheckout` (the opt-in dev-time check found a missing target); `TargetsParam`, `TargetsHash` and `VerifySession` (malformed targets); `ParseISODuration` (not a supported duration). |
| `disabled` | `CodeDisabled` | `SignIn`, `OpenCheckout` when `SPONSORKIT_DISABLE` is set. |
| `access_denied` | `CodeAccessDenied` | `SignIn`, `OpenCheckout`: the user declined at the provider. |
| `invalid_state` | `CodeInvalidState` | `SignIn`, `OpenCheckout`: the sign-in state expired or was invalid. |
| `provider_error` | `CodeProviderError` | `SignIn`, `OpenCheckout`: the provider failed. |
| `invalid_code` | `CodeInvalidCode` | `SignIn`, `OpenCheckout`: the API rejected the code exchange. |
| `cancelled` | `CodeCancelled` | `SignIn`, `OpenCheckout` (sign-in phase): the paste-back prompt returned an error or nothing. For `SignIn` also when `ctx` is cancelled (`OpenCheckout` resolves `CheckoutUnknown` instead). |
| `timeout` | `CodeTimeout` | `SignIn`, and the sign-in phase of `OpenCheckout`: `Options.SignInTimeout` elapsed. |
| `network_error` | `CodeNetworkError` | `SignIn`, `OpenCheckout` (during sign-in), `VerifySession`: unreachable, timed out, 5xx, 429 or an unexpected response. Also a forced `SignInLoopback` that can't listen on `127.0.0.1`. |
| `session_invalid` | `CodeSessionInvalid` | `VerifySession` only. |
| `targets_mismatch` | `CodeTargetsMismatch` | `VerifySession` only. |

`CodePopupBlocked` (`popup_blocked`) exists for parity with the browser SDKs; the Go SDK never returns it.

## What doesn't return errors

- **`GetFinancialContribution`** returns an error only for the dev-time check. Network failures, timeouts, 5xx,
  429 and unexpected responses give you the cached result (`FromCache` and `Stale`), or a signed-in result with
  no contributions and `Stale` set. A rejected session signs the user out and returns the signed-out result. See
  [offline and stale results](contributions.md#offline-and-stale-results).
- **`OpenCheckout`** reports "nothing detected" as `CheckoutUnknown`, not as an error, including when you cancel
  `ctx` or the polling `Timeout` elapses.
- **`Nag.Due`** returns a plain `bool`; any problem makes it false.
- **`IsSignedIn`, `SessionToken`, `CheckoutURL`** (for valid options) never touch the network.

## Retry-After

When Sponsorkit sends a `Retry-After` header, the `network_error` from `SignIn` or `VerifySession` carries
`RetryAfter`, whatever the status (a `429`, a `503` or any other unexpected response). It is parsed from the
header (seconds or an HTTP date, capped at 24 hours). It is nil when the API sent no
usable header. `GetFinancialContribution` honours `Retry-After` by itself: it serves the cache and makes no
request for that long, for the rest of the process.

```go
var skErr *sponsorkit.Error
if errors.As(err, &skErr) && skErr.Code == sponsorkit.CodeNetworkError && skErr.RetryAfter != nil {
	fmt.Println("Try again in", skErr.RetryAfter.Round(time.Second))
}
```

## Cancellation with context.Context {#cancellation}

Every method that can do network I/O or block takes a `context.Context` as its first argument:
`GetFinancialContribution`, `SignIn`, `SignOut`, `OpenCheckout`, `Nag.Due` and `VerifySession`. `IsSignedIn`,
`SessionToken` and `Nag.Shown` take none: they only read or write the local state file. Its deadline and cancellation apply to
every request the call makes, on top of `RequestTimeout`.

| Method | When `ctx` is cancelled |
|---|---|
| `SignIn` | Returns `cancelled`, wrapping `ctx.Err()`. The loopback listener is shut down. |
| `OpenCheckout` | Returns `CheckoutUnknown` with no error, in the sign-in and the polling phase. |
| `GetFinancialContribution`, `Nag.Due` | The request fails like any network error, so you get the cached result. |
| `VerifySession` | Returns `network_error`, wrapping the context's error. |

Cancellation and the SDK's own timeouts are separate on purpose:

- `SignIn` distinguishes **your** cancellation (`cancelled`) from **its** `SignInTimeout` (`timeout`), so you can
  tell "the user pressed Ctrl+C" from "the user walked away".
- A deadline on `ctx` is your cancellation: when it expires during a sign-in, the code is `cancelled` and
  `errors.Is(err, context.DeadlineExceeded)` is true.

```go title="main.go"
package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", AppName: "my-cli"})
	if err != nil {
		panic(err)
	}
	_, err = sk.SignIn(ctx)
	switch {
	case err == nil:
		fmt.Println("signed in")
	case errors.Is(err, context.DeadlineExceeded):
		fmt.Println("gave up after two minutes") // code: cancelled
	case sponsorkit.ErrorCodeOf(err) == sponsorkit.CodeTimeout:
		fmt.Println("SignInTimeout elapsed")
	default:
		fmt.Println(err)
	}
}
```

The [errors and offline guide](../../guides/errors-and-offline.md) has patterns for showing stale data and
handling expired provider sign-ins.
