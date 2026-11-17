---
title: Configuring the JavaScript / TypeScript SDK
description: Every Sponsorkit constructor option with its default, the environment variables, and the exported defaults.
sidebar_label: Configuration
order: 10
---

All configuration goes into the constructor. The constructor validates everything up front and throws a
`SponsorkitError` with code `invalid_config` for a missing target or a malformed option, so mistakes surface on
the first line that uses the SDK rather than at sign-in time.

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({
  github: "octocat",               // GitHub user or organization login
  opencollective: "my-collective", // Open Collective collective slug
  cacheTtl: 3600,                  // seconds a cached result is served without calling the API
  requestTimeout: 30,              // seconds before an API request is abandoned
});
```

Durations are in **seconds** and amounts in **minor units** (cents) everywhere in the SDK.

## Options for every client

These come from [`SponsorkitCoreOptions`](/docs/reference/js/sdk/sponsorkitcoreoptions) and apply to both
`@sponsorkit/sdk` and `@sponsorkit/sdk/node`.

| Option | Type | Default | What it does |
|---|---|---|---|
| `github` | `string` | none | GitHub user or organization login that receives sponsorships. |
| `opencollective` | `string` | none | Open Collective collective slug that receives contributions. At least one of `github` and `opencollective` is required. |
| `cacheTtl` | `number` | `3600` | Seconds a cached result is served without calling the API. Values below `60` are raised to `60`; negative values throw `invalid_config`. |
| `mock` | `MockOption` | none | Mock mode: a preset name or `{ contributions }`. Overrides `SPONSORKIT_MOCK`. See [Testing](testing.md). |
| `storage` | `SponsorkitStorage` or Web Storage object | platform default | Where the session token, cache and nag state live. See [Platform notes](platform-notes.md#where-state-is-stored). |
| `apiBaseUrl` | `string` | `"https://sponsorkit.io"` | API origin, for [self-hosting](/docs/reference-http/self-hosting) and tests. Must be `http` or `https`; only the origin is used. |
| `env` | `Record<string, string \| undefined>` | `process.env` | Environment used for the variables below. When given, it **replaces** the process environment for them; it is not merged. |
| `devChecks` | `boolean` | see below | Checks once per process that the targets exist (`GET /api/v1/targets`), and throws `invalid_config` on the first async call if one doesn't. |
| `signInTimeout` | `number` | `300` | Seconds to wait for a sign-in (popup, loopback or paste-back) before rejecting with `timeout`. Must be positive. |
| `checkoutPollInterval` | `number` | `60` | Seconds between polls while `openCheckout()` waits for the new contribution. Must be positive. |
| `clock` | `() => number` | `Date.now` | Epoch-millisecond clock for cache expiry, `Retry-After` and nag timing. |
| `fetch` | `FetchLike` | global `fetch` | Custom `fetch` implementation (proxies, logging, tests). |
| `requestTimeout` | `number` | `30` | Seconds before an API request (headers and body) is abandoned. `getFinancialContribution()` then serves the cache; the sign-in code exchange rejects with `network_error`. `0` disables the limit. |
| `interactive` | `boolean` | detected | Whether the app is interactive, for `nag().due()`. Browsers count as interactive; on Node it is "stdout and stderr are both TTYs". |

`devChecks` defaults to on when `SPONSORKIT_DEV_CHECKS` is set, or when `process.env.NODE_ENV` is
`"development"` (most bundlers replace that expression at build time), and off otherwise. The check never
runs in mock mode or when Sponsorkit is disabled, and it is skipped silently when the API can't be reached.

## Browser options

Only for `Sponsorkit` from `@sponsorkit/sdk`
([`SponsorkitOptions`](/docs/reference/js/sdk/sponsorkitoptions)).

| Option | Type | Default | What it does |
|---|---|---|---|
| `returnTo` | `string` | none | Redirect fallback when the popup is blocked: an `https` URL of your app (or `http://localhost`, `127.0.0.1`, `[::1]`) to come back to with `?sponsorkit_code=…`. Without it, a blocked popup rejects with `popup_blocked`. |
| `openWindow` | `(url: string) => Window \| null` | `window.open(url, "sponsorkit", popupFeatures)` | Opens the popup. Must open the window synchronously. |
| `popupFeatures` | `string` | `"popup,width=520,height=720"` | The `features` argument of `window.open`. |

## Node, Bun and Deno options

Only for `Sponsorkit` from `@sponsorkit/sdk/node`
([`SponsorkitOptions`](/docs/reference/js/node/sponsorkitoptions)).

| Option | Type | Default | What it does |
|---|---|---|---|
| `appName` | `string` | none | Shown on the consent page as the app that "says it is" asking. At most 64 characters. |
| `storageDir` | `string` | per-user config directory | Directory for the storage file. Ignored when `storage` is given. |
| `signInMethod` | `"auto" \| "loopback" \| "paste"` | `"auto"` | How sign-in delivers the code. See [Sign-in](sign-in.md#node-bun-and-deno). |
| `openBrowser` | `(url: string) => void \| Promise<void>` | system browser | Opens a URL. The default runs `open` (macOS), `xdg-open` (Linux) or `rundll32` (Windows) without a shell. |
| `promptForCode` | `(url: string) => string \| Promise<string>` | reads a line from stdin | Asks the user for the paste-back code; receives the URL they need to open. |
| `output` | `{ write(text: string): unknown }` | `process.stderr` | Where messages for the user (sign-in links) are printed. |

## Environment variables

A variable counts as set when it is non-empty and not `0` or `false` (case-insensitive). The SDK reads them
from `process.env` where it exists, or from the `env` option.

| Variable | Effect |
|---|---|
| `SPONSORKIT_DISABLE` | Turns Sponsorkit off: no network or disk access, results have `disabled: true`, `signIn()` and `openCheckout()` reject with `disabled`, `nag().due()` returns `false`. Beats `mock`. |
| `SPONSORKIT_MOCK` | A mock preset name, used when the `mock` option isn't given. |
| `SPONSORKIT_NO_NAG` | `nag().due()` returns `false` (unless `force`). |
| `SPONSORKIT_DEV_CHECKS` | Turns the dev-time target check on, unless `devChecks: false`. |
| `CI` | `nag().due()` returns `false` (unless `force`). |

`SPONSORKIT_DISABLE` is how users of your app opt out; mention it in your README.

In browsers there is usually no `process.env`, so the variables only apply if your bundler defines them. Pass
`env` explicitly when you want them in a web app:

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({
  github: "octocat",
  env: { SPONSORKIT_MOCK: new URLSearchParams(location.search).get("mock") ?? undefined },
});
```

## Exported defaults

The defaults are exported as constants, in case you want to show them or build on them:

| Constant | Value |
|---|---|
| `DEFAULT_API_BASE_URL` | `"https://sponsorkit.io"` |
| `DEFAULT_CACHE_TTL` | `3600` |
| `DEFAULT_CHECKOUT_POLL_INTERVAL` | `60` |
| `DEFAULT_CHECKOUT_TIMEOUT` | `600` |
| `DEFAULT_SIGN_IN_TIMEOUT` | `300` |

## Instance properties

After construction a client exposes what it resolved:

| Property | Type | Meaning |
|---|---|---|
| `targets` | `readonly string[]` | Canonical target strings, e.g. `["github:octocat", "opencollective:my-collective"]`. |
| `targetsParam` | `string` | The same, comma-separated. |
| `apiBaseUrl` | `string` | The API origin in use. |
| `disabled` | `boolean` | `SPONSORKIT_DISABLE` is set. |
| `isMock` | `boolean` | Mock mode is on. |
| `appName` | `string \| undefined` | Node client only. |

Targets are normalized (trimmed and lowercased) and validated: a GitHub login must be a valid GitHub login and
an Open Collective slug a valid slug, otherwise the constructor throws `invalid_config`. See
[Targets](/docs/concepts/targets) for why the target set matters.
