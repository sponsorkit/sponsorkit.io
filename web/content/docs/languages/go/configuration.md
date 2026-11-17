---
title: Configuring the Go SDK
description: Every sponsorkit.Options field with its default, the per-call options, the environment variables and the exported constants.
sidebar_label: Configuration
order: 10
---

All configuration goes into `sponsorkit.Options`, passed to `sponsorkit.New`. `New` validates everything up front
and returns a `*sponsorkit.Error` with code `invalid_config` for anything wrong. It does no I/O: nothing touches
the network or the disk until you call a method.

```go title="main.go"
package main

import (
	"log"
	"time"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	sk, err := sponsorkit.New(sponsorkit.Options{
		GitHub:         "octocat",
		OpenCollective: "my-collective",
		AppName:        "my-cli",
		CacheTTL:       30 * time.Minute,
	})
	if err != nil {
		log.Fatal(err) // e.g. sponsorkit: invalid_config: invalid github account "-bad-"
	}
	log.Println(sk.Targets()) // [github:octocat opencollective:my-collective]
}
```

Zero values mean "use the default" throughout, so you only set what you need.

## Options

### Targets and identity

| Field | Type | Default | Meaning |
|---|---|---|---|
| `GitHub` | `string` | – | The GitHub user or organization login that receives sponsorships. |
| `OpenCollective` | `string` | – | The Open Collective slug that receives contributions. |
| `AppName` | `string` | – | Shown on the consent page as "*AppName* says it is…". At most 64 characters. |

At least one of `GitHub` and `OpenCollective` is required. Accounts are trimmed and lowercased, and must be valid
logins or slugs; see [targets](../../concepts/targets.md). The target set is sealed into every session, so
changing it later signs users out of your app ([why](../../concepts/targets.md#target-sets-are-sealed-into-sessions)).

### Caching, storage and network

| Field | Type | Default | Meaning |
|---|---|---|---|
| `CacheTTL` | `time.Duration` | 1 hour | How long a result is served from the local cache without calling the API. Values below 1 minute are raised to 1 minute; negative values are `invalid_config`. Per call, `WithCacheTTL` overrides it without the minimum. |
| `StorageDir` | `string` | `DefaultStorageDir()` | Directory of the state file. Ignored when `Storage` is set. If there is no per-user config directory (for example `HOME` and `XDG_CONFIG_HOME` are unset), state is kept in process memory only. |
| `Storage` | `sponsorkit.Storage` | `&DirStorage{Dir: StorageDir}` | Replaces file storage entirely, for example with a keychain-backed implementation. |
| `APIBaseURL` | `string` | `https://sponsorkit.io` | The API origin, for [self-hosting](../../reference-http/self-hosting.md) and tests. Must be an `http` or `https` URL. |
| `HTTPClient` | `*http.Client` | `&http.Client{}` | Used for every API call. Its transport, proxy settings and TLS configuration apply. |
| `RequestTimeout` | `time.Duration` | 30 s | Bounds each HTTP request, including reading the response. `sponsorkit.NoRequestTimeout` (any negative value) disables it. Applies whichever `HTTPClient` you pass. |

The zero value of `RequestTimeout` means the 30 second default. Other SDKs disable the timeout with
`requestTimeout: 0`; in Go that is `sponsorkit.NoRequestTimeout`.

### Sign-in and checkout

| Field | Type | Default | Meaning |
|---|---|---|---|
| `SignInMethod` | `sponsorkit.SignInMethod` | `SignInAuto` | `SignInAuto`, `SignInLoopback` or `SignInPaste`. See [choosing a flow](sign-in.md#choosing-a-flow). Any other value is `invalid_config`. |
| `SignInTimeout` | `time.Duration` | 5 minutes | How long a sign-in waits for the user (also the sign-in phase of `OpenCheckout`). Exceeding it returns `timeout`. Negative is `invalid_config`. |
| `OpenBrowser` | `func(ctx context.Context, url string) error` | `sponsorkit.OpenSystemBrowser` | Opens a URL for the user. An error makes `SignInAuto` fall back to paste-back. |
| `PromptForCode` | `func(ctx context.Context, url string) (string, error)` | `sponsorkit.PromptStdin` | Asks for the paste-back code; receives the URL the user must open. |
| `CheckoutPollInterval` | `time.Duration` | 60 s | How often `OpenCheckout` polls for the new contribution. Negative is `invalid_config`. |
| `Stderr` | `io.Writer` | `os.Stderr` | Receives user-facing messages, such as the paste-back URL. |

### Testing and environment

| Field | Type | Default | Meaning |
|---|---|---|---|
| `Mock` | `*sponsorkit.Mock` | `nil` | Mock mode: `sponsorkit.MockPreset(name)` or `sponsorkit.MockContributions(...)`. Takes precedence over `SPONSORKIT_MOCK`. An unknown preset is `invalid_config`. See [Testing](testing.md). |
| `Env` | `map[string]string` | `nil` (process environment) | Replaces the process environment for the variables below. It is not merged: a variable missing from the map counts as unset. |
| `DevChecks` | `*bool` | on only when `SPONSORKIT_DEV_CHECKS` is set | The dev-time check that your targets exist. |
| `Clock` | `func() time.Time` | `time.Now` | The current time, for the cache TTL and nag timing. |
| `Interactive` | `*bool` | TTY detection | Overrides the check that stdout and stderr are terminals, used by `Nag.Due`. |

## Per-call options

Some methods take their own options, which override the client's for that call:

| Method | Options |
|---|---|
| `GetFinancialContribution(ctx, opts ...GetOption)` | `sponsorkit.WithCacheTTL(d)`: `0` always refreshes (unless a `Retry-After` is still in force). |
| `SignIn(ctx, opts ...SignInOptions)` | `SignInOptions{Provider, Method}`: skip the provider picker, or force a flow. Pass at most one. |
| `OpenCheckout(ctx, CheckoutOptions)`, `CheckoutURL(CheckoutOptions)` | `Provider`, `Amount` (minor units), `Currency`, `Frequency`, and for `OpenCheckout` also `Timeout` (10 minutes), `PollInterval` and `SignInMethod`. See [Checkout](checkout.md#options). |
| `Nag.Due(ctx, predicate, opts ...DueOption)` | `sponsorkit.Force()`: skip the TTY, CI and `SPONSORKIT_NO_NAG` checks. |
| `sponsorkit.VerifySession(ctx, token, targets, opts ...VerifyOption)` | `WithAPIBaseURL`, `WithHTTPClient`, `WithRequestTimeout`. See [Backend verification](backend-verification.md#options). |

## Environment variables

A variable counts as set when it is non-empty and not `0` or `false` (in any case). With `Options.Env`, the map is
read instead of the process environment.

| Variable | Effect |
|---|---|
| `SPONSORKIT_DISABLE` | Turns the SDK off: no network, no disk, `Result.Disabled` is true, `Nag.Due` is always false, and `SignIn`/`OpenCheckout` return `disabled`. Wins over mock mode. |
| `SPONSORKIT_MOCK` | Mock mode with the named preset, when `Options.Mock` is nil. |
| `SPONSORKIT_NO_NAG` | `Nag.Due` is always false (unless `Force()`). |
| `SPONSORKIT_DEV_CHECKS` | Turns on the dev-time target check when `Options.DevChecks` is nil. |
| `CI` | `Nag.Due` is always false (unless `Force()`). |
| `SSH_CONNECTION` | `SignInAuto` uses paste-back. |
| `DISPLAY`, `WAYLAND_DISPLAY` | On Linux and the BSDs, when both are empty and `OpenBrowser` is the default, `SignInAuto` uses paste-back. |

Tell your users about `SPONSORKIT_DISABLE` and `SPONSORKIT_NO_NAG`; see [turning Sponsorkit off](../../concepts/error-contract.md#turning-sponsorkit-off).

### The dev-time target check

Go has no "development build" signal, so the check that your targets exist is off unless you turn it on with
`SPONSORKIT_DEV_CHECKS=1` or `DevChecks`. When on, the first `GetFinancialContribution`, `SignIn` or
`OpenCheckout` in a process calls `GET /api/v1/targets` once. A target that doesn't exist (or has no sponsorship
listing) makes those methods return `invalid_config` for the rest of the process; if the API can't be reached, the
check is skipped.

```go title="main.go"
package main

import (
	"log"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	on := true
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", DevChecks: &on})
	if err != nil {
		log.Fatal(err)
	}
	_ = sk
}
```

## Constants and helpers

| Name | Value |
|---|---|
| `sponsorkit.Version` | The SDK version, `"0.1.0"`. Sent in the `User-Agent` header as `sponsorkit-go/0.1.0`. |
| `sponsorkit.DefaultAPIBaseURL` | `"https://sponsorkit.io"`. |
| `sponsorkit.NoRequestTimeout` | `-1`: disables `RequestTimeout` and `WithRequestTimeout`. |
| `sponsorkit.MockPresetNames` | The mock preset names. |
| `sponsorkit.DefaultStorageDir()` | The default `StorageDir`; see [platform notes](platform-notes.md#where-state-is-stored). |
| `sponsorkit.TargetsParam(t)`, `sponsorkit.TargetsHash(t)` | The canonical target string (`github:octocat,opencollective:webpack`) and its SHA-256, which names the state file. |
| `sponsorkit.ParseISODuration(s)` | Parses `"P7D"`-style durations, for configuring nags from a file. |

The client also reports its configuration: `Targets()`, `TargetsParam()`, `Disabled()` and `IsMock()`.
