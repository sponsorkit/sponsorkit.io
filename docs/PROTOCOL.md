# Sponsorkit wire protocol (normative)

This document is the contract between the Worker (`app/`), the static pages (`web/`), the conformance fake server (`sdks/conformance/`) and every SDK.

- `docs/SPEC.md` explains *why*. This file defines *exactly what goes over the wire*.
- TypeScript schemas live in `packages/shared/src`. Every other language mirrors them.
- Base URL: `https://sponsorkit.io`. SDKs accept an `apiBaseUrl` override, which is the origin only. All paths below are relative to that origin.

## 1. Targets

- A target is `github:<login>` or `opencollective:<slug>`. The account is **lowercased** and trimmed.
  - GitHub login: `^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$`.
    - RE2-compatible equivalent: `^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$`, and the login must not contain `--`.
  - Open Collective slug: `^[a-z0-9][a-z0-9-]{0,254}$`.
- A **target set** is one or more targets, with at most one per provider in v1. It is deduplicated and sorted by its string form, using byte-wise ASCII comparison.
- **Target param:** the canonical set joined with `,`. Example: `github:mathiaslorenzen,opencollective:sponsorkit`. It is used in every URL as `targets=`, URL-encoded as normal.
- **targets_hash:** lowercase hex SHA-256 of the UTF-8 target param. It is used for SDK storage keys.

## 2. PKCE

- `code_verifier` is 43–128 characters from `[A-Za-z0-9-._~]`. SDKs generate 32 random bytes and encode them as base64url without padding, which gives 43 characters.
- `code_challenge` is `base64url(sha256(ascii(code_verifier)))`, without padding. The method is always S256 and is implied.

## 3. HTTP API (`/api/v1`)

- All responses are JSON.
- **Errors** are `application/problem+json`: `{ type, title, status, code, detail? }`. `type` is `https://sponsorkit.io/docs#error-contract`. `code` is one of:
  - `invalid_request`
  - `invalid_target`
  - `invalid_code`
  - `session_invalid`
  - `rate_limited`
  - `not_found`
  - `internal`
- **Request ID:** every response carries `Sponsorkit-Request-Id`.
- **`429` responses** carry `Retry-After`, in seconds.
- **CORS:** `Access-Control-Allow-Origin: *`, with no credentials. The allowed headers are `Authorization` and `Content-Type`. The exposed headers are `Sponsorkit-Session`, `Sponsorkit-Request-Id` and `Retry-After`.

### 3.1 `GET /api/v1/targets?github=<login>&opencollective=<slug>`

At least one parameter is required. The response is `TargetsResponse`:

- `{ targets: TargetInfo[] }`, in canonical order.
- A target that doesn't exist is still returned, with `exists: false`.
- Malformed parameters return `400 invalid_target`.
- The response is cacheable (`Cache-Control: public, max-age=3600`).
- **A GitHub account without a Sponsors listing** has `exists: false`. `displayName` and `avatarUrl` are still filled when the account exists.
- **An Open Collective account** has `exists: true` only when all of these hold:
  - its account type can receive contributions;
  - it is active;
  - it is not archived.
- **GitHub `customAmount`** is best-effort. GitHub doesn't expose the listing's "custom amounts" setting, so it is `true` only when a published tier has `isCustomAmount`.
- **Open Collective tiers:** `FLEXIBLE`-frequency tiers and non-contribution tiers (tickets, products) are omitted. OC tiers have `url: null`.
- **`TargetTier.id`** is the provider's opaque id. For GitHub this is the GraphQL node id.
- **A provider that can't be reached** gives `502` with code `internal`. That response is not cached.

### 3.2 `POST /api/v1/auth/token`

**Request body:** `{ code, codeVerifier, sessionToken? }`.

**Response `200`:** `{ sessionToken, expiresAt, result }`.

- `result` is the same `ContributionResult` that `/contributions` would return, fetched live. This lets the SDK show something immediately.

**Errors:**

| Status | Code | When |
|---|---|---|
| `400` | `invalid_code` | The code is malformed, expired, tampered with, or the verifier doesn't match. |
| `400` | `invalid_request` | The `sessionToken` has a different target set from the code. |
| `401` | `session_invalid` | The `sessionToken` is invalid. |

**Adding an identity:** when `sessionToken` is given, the new identity is added to that session's identities. An identity for the same provider is replaced. The response contains a new session token holding both.

### 3.3 `GET /api/v1/contributions`

- **Request:** send `Authorization: Bearer sks_…`.
- **Response `200`:** a `ContributionResult` with `signedIn: true`, `disabled: false`, `mock: false` and `fromCache: false`.
- **Partial results:** if some providers failed, the result has `stale: true` and lists them in `unavailable`. The contributions of those providers are omitted. The SDK fills them in from its cache, using `contribution.provider`.
- **Session renewal:** the response may carry `Sponsorkit-Session: sks_…`. When it does, the SDK must replace the token it has stored.
- **Errors:**
  - `401 session_invalid`: the token is missing, malformed, tampered with, expired or sealed with an unknown key.
  - `429 rate_limited`: more than 1 refresh per 60 s per session. Comes with `Retry-After`.

### 3.3.1 Semantics

- **`supporter.id`** is derived from the session's **first** identity, the original sign-in. Adding a second provider keeps it stable.
- **Identities flagged `needsReconnect`:** their provider is also listed in `unavailable`, and `stale` is `true`, so the SDK keeps its cached data for that provider.
- **GitHub amount:** when GitHub hides `tier`, `amount` is `{ value: 0, currency: "USD" }` and `tier` is `null`.

### 3.4 `GET /api/v1/health`

Returns `{ ok: true, providers: { github: "ok" | "degraded", opencollective: "ok" | "degraded" } }`.

## 4. Browser pages & OAuth endpoints

### 4.1 Common query parameters

These are used by `/connect`, `/checkout` and `/api/oauth/:provider/start`. All are lowercase snake_case.

| Param | Meaning |
|---|---|
| `targets` | Target param (§1). Required. |
| `challenge` | PKCE code challenge. Required for sign-in; absent for anonymous checkout links. |
| `delivery` | `web_message` \| `redirect` \| `loopback` \| `paste` |
| `origin` | `web_message` only: the opener's origin, e.g. `https://app.example.com`. Must be `https`, or `http` only on `localhost`, `127.0.0.1` or `[::1]`. |
| `redirect_uri` | `redirect`: an https URL, or an `http://localhost[:port]` / `http://127.0.0.1[:port]` URL.<br>`loopback`: exactly `http://127.0.0.1:<port>/callback` or `http://[::1]:<port>/callback`. |
| `app_name` | Optional. 1–64 code points, with no control or format characters (Unicode Cc/Cf). Native apps only; shown on screen as "says it is". |
| `provider` | Optional. `github` or `opencollective`. Skips the provider picker. |
| `add` | `1` when adding an identity to an existing session. This only affects the UI copy; the merge happens at `/auth/token`. |

Additional rules:

- `origin` and `redirect_uri` that don't match the chosen `delivery` are ignored.
- `targets` is canonicalized by whoever receives it.
- `/api/oauth/:provider/start` always requires `challenge`.

### 4.2 `/connect` (static page)

1. The page validates the params. If they are invalid, it shows an error.
2. It loads `GET /api/v1/targets` and shows the consent screen. The screen includes:
   - each target's avatar and name;
   - who is asking: the `origin` for `web_message`, the host of `redirect_uri` for `redirect`, or `app_name` labelled "says it is" for `loopback` and `paste`;
   - the consent text from SPEC §5.4;
   - one button per provider that is present in the target set.
3. A provider button navigates to `/api/oauth/<provider>/start?<same params>`.

### 4.3 `GET /api/oauth/:provider/start`

0. **Check the request came from the consent screen.**
   - Applies when the request carries `Sec-Fetch-Site` with a value other than `same-origin` or `same-site`, i.e. `cross-site` or `none`.
   - In that case the Worker returns an HTML `403`. It sets no cookie and does not redirect.
   - The page links to `/connect?<same params>`, or to `/checkout?<continue>&<sign-in params>` when `continue` is present.
   - This guarantees the consent screen was shown. Requests without Fetch Metadata are accepted.
1. **Validate** the params. The same rules apply as in §4.1, and the `provider` must be in the target set. Invalid params return `400` as an HTML error page.
2. **Generate** a 32-byte `browser_nonce` and set it as a cookie: `__Host-sk_nonce=<base64url>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=1200`. That is the state lifetime plus 600 s of grace, so an expired state can still be reported as `invalid_state`.
3. **Create a sealed state** (§5) containing the provider, the targets, the delivery params, `sha256(browser_nonce)`, a provider PKCE verifier, an optional `continue` value (see §4.6), and `exp = now + 600 s`.
4. **Redirect `302`** to the provider's authorize URL with `state=<sealed>`:
   - **GitHub:** `https://github.com/login/oauth/authorize?client_id=…&redirect_uri=<origin>/api/oauth/github/callback&scope=read:user%20read:org&state=…&code_challenge=…&code_challenge_method=S256&allow_signup=false`
   - **Open Collective:** `https://opencollective.com/oauth/authorize?client_id=…&response_type=code&redirect_uri=<origin>/api/oauth/opencollective/callback&scope=orders%20incognito&state=…&code_challenge=…&code_challenge_method=S256`

### 4.4 `GET /api/oauth/:provider/callback?code=…&state=…`

1. **Check the state.** Unseal it, check that it hasn't expired, and check that `sha256(cookie nonce)` matches the value in the state. Then clear the cookie.
2. **Get the provider token.** Exchange the provider code (with the provider PKCE verifier) for an access token, then fetch the identity:
   - **GitHub:** `viewer { databaseId login }`.
   - **Open Collective:** `me { id slug }`. The token expiry is `now + expires_in`.
3. **Create a sealed sign-in code** (§5): `skc_…`.
4. **Deliver it** with a `302` to:

| Delivery | Location |
|---|---|
| `web_message` | `/connect/done#code=<skc>&origin=<urlencoded origin>[&continue=<urlencoded continue>]` |
| `redirect` | `<redirect_uri>` with the query parameter `sponsorkit_code=<skc>` appended |
| `loopback` | `<redirect_uri>?code=<skc>` |
| `paste` | `/connect/done#paste=<skc>[&continue=…]` |

**Failures:**

- **The user denied access at the provider** (`error=access_denied`), or the state can be decrypted but has expired. The Worker delivers an error the same way it would deliver a code:
  - `web_message`: `/connect/done#error=<code>&origin=…`
  - `redirect`: `sponsorkit_error=<code>`
  - `loopback`: `?error=<code>`
  - `paste`: `/connect/done#error=<code>`

  `<code>` is one of `access_denied`, `invalid_state` or `provider_error`.
- **The nonce cookie doesn't match the state, or the state can't be decrypted** (a tampered state carries no delivery params), **or the provider doesn't match.** The Worker shows an HTML error page and delivers nothing.
- **Order of checks:** the nonce cookie is verified before any delivery, including error deliveries.

### 4.5 `/connect/done` (static page)

The page reads `location.hash` first and then removes it with `history.replaceState`.

- **`code` with `origin`.** Calls `window.opener.postMessage({ type: "sponsorkit:code", code }, origin)`.
  - If there is no `continue`, it closes itself after about 300 ms. If it can't close, it shows "You can close this window."
  - If `continue` is present, it navigates to `/checkout?<continue>&step=choose`.
- **`paste`.** Shows the code in a monospace box with a copy button, plus the text "Paste this into the app (valid for 10 minutes)".
  - If `continue` is present, it also shows a **Continue to checkout** link to `/checkout?<continue>&step=choose`.
- **`error`.** If `origin` is set and there is an opener, it posts `{ type: "sponsorkit:error", error }` to that origin. In every case it shows a message.

### 4.6 `/checkout` (static page)

**Parameters:**

| Group | Params |
|---|---|
| From §4.1 | `targets`, `challenge?`, `delivery?`, `origin?`, `redirect_uri?`, `app_name?` |
| Checkout options | `amount?` (minor units, integer), `currency?` (ISO 4217), `frequency?` (`one_time` \| `monthly` \| `yearly`), `provider?` |
| Control | `step?` (`choose`) |

**Flow:**

1. **Sign in first, if needed.** If `challenge` is present and `step` is not `choose`, the page needs a sign-in first. It does what `/connect` does: show consent, then start provider OAuth with all its own params. It passes `continue=<urlencoded checkout query string without challenge, delivery, origin, redirect_uri>` to `/api/oauth/:provider/start`, so that after sign-in the user comes back to `/checkout?<continue>&step=choose`.
   - With `loopback` delivery, the SDK's loopback server responds to `/callback` with a `302` to `<base>/checkout?<checkout params>&step=choose`.
2. **Choose a provider.** The page loads `/api/v1/targets` and computes eligibility using the rules in §6. If exactly one provider is eligible, or `provider` is given and eligible, it redirects there immediately. Otherwise it shows the chooser, with a reason for each disabled option.
3. **Before redirecting,** the page posts `{ type: "sponsorkit:checkout_redirected", provider }` to the opener when `origin` is known and an opener exists. The SDK doesn't depend on this message.
4. **Without `challenge`** (an anonymous link from `checkoutUrl()`), the page skips sign-in and goes straight to step 2.

## 5. Sealed values

- **Format:** `<prefix><base64url(keyId(1 byte) ‖ nonce(12) ‖ AES-256-GCM ciphertext+tag)>`.
- **AAD:** the UTF-8 string `sponsorkit:<kind>:v1`, where `<kind>` is one of `state`, `code` or `session`.
- **Prefixes:** `sks_` for sessions, `skc_` for codes. The state has no prefix.
- **Plaintext:** compact JSON. Fields:
  - `state`: `{ p, t, d, o?, r?, a?, c, n, v, k?, x }`, meaning provider, targets param, delivery, origin, redirect_uri, app_name, challenge, nonce hash, provider PKCE verifier, `continue`, and expiry in unix seconds.
  - **Code:** `{ i: Identity+token, t, c, d, o?, r?, x }`. Expires after 60 s, or after 600 s when the delivery is `paste`.
  - **Session:** `{ v: 1, t, ids: [{ p, id, h, tok, tx? }], iat, x }`. Expires `iat + 180 days`.
- **Unsealing:** fails closed on any error, and the caller gets `invalid_code` or `session_invalid`.
- **Renewal:** if `now - iat > 7 days`, `/contributions` re-seals the session with a fresh `iat` and `x` under the current key, and returns it in `Sponsorkit-Session`.
- **Keys:** `SEALING_KEYS` holds a JSON array `[{ id, key }]`, where `key` is 32 bytes encoded as base64url. The first entry is current, and the others are accepted for unsealing only.

## 6. Checkout eligibility (identical in `/checkout` and SDK docs)

**Inputs:** `amount?`, `currency?`, `frequency?`, and the `TargetInfo` of each target.

A provider is **eligible** if all of these hold:

1. **Target:** `exists` is true.
2. **Frequency:** if `frequency` is given, it is in `TargetInfo.frequencies`.
   - GitHub: `["monthly", "one_time"]`.
   - Open Collective: `["one_time", "monthly", "yearly"]`.
3. **Currency:** if `currency` is given, it equals `TargetInfo.currency`. GitHub is always `USD`.
4. **Tiers (GitHub only):** at least one tier matches the frequency, or `monthly` when no frequency is given. A GitHub target with no matching tier is ineligible.

**When the requested `provider` isn't eligible** but another provider is, `/checkout` shows the chooser with a notice and the reasons. It never silently switches provider.

**Redirect URL:**

- **GitHub:** pick the cheapest tier with `amount.value >= amount` for the frequency, or else the highest tier. With no `amount`, pick the cheapest tier for the frequency.
  - The URL is the tier's `url` if present. The Worker builds it as `https://github.com/sponsors/<login>/sponsorships?tier_id=<databaseId>` when it can decode the databaseId.
  - Otherwise it is `https://github.com/sponsors/<login>`.
  - Clients never build `tier_id` themselves.
- **Open Collective:** `https://opencollective.com/<slug>/donate`. The query string includes:
  - `amount=<major units, e.g. 5 or 5.5>`, when `amount` is given.
    - Conversion uses **ISO 4217 minor-unit digits**, never Intl/CLDR digits.
    - 0 digits: BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF.
    - 3 digits: BHD IQD JOD KWD LYD OMR TND.
    - 4 digits: CLF UYW.
    - Every other currency uses 2.
    - The Worker reports Open Collective amounts in the same ISO minor units, converted from Open Collective's fixed ×100 storage.
  - `interval=month|year` for `monthly`/`yearly`; it is omitted for one-time;
  - `redirect=<sponsorkit origin>/checkout/thanks`.

## 7. SDK behaviour hooks (required for testability)

Every SDK must accept the following options, using names idiomatic to its language:

| Option | Default | Used by |
|---|---|---|
| `apiBaseUrl` | `https://sponsorkit.io` | All calls. The conformance server runs on `http://127.0.0.1:<port>`. |
| `openBrowser(url)` | Opens the system browser (native) or `window.open` (browser) | The tests replace it with an HTTP GET that follows redirects. |
| `promptForCode()` | Reads a line from stdin | Paste-back sign-in. The tests return a fixed code. |
| `storageDir` / `storage` | Per-user config directory or `localStorage` | The tests use a temporary directory. |
| `clock` | Not required | If present, it must be injectable for nag and cache-TTL tests. Otherwise the tests use small TTLs. |
| `signInTimeout` | 300 s | Maximum time to wait for a loopback or paste sign-in, or a popup sign-in. Exceeding it throws `timeout`. |
| `interactive` | TTY detection | Overrides the stdout/stderr TTY check used by the nag helper. Tests set it to `false`. |
| `signInMethod` | `auto` | `"auto" \| "loopback" \| "paste"`, which forces a sign-in flow. |
| `env` | Process environment | A per-instance override for `SPONSORKIT_DISABLE`, `SPONSORKIT_MOCK`, `SPONSORKIT_NO_NAG`, `SPONSORKIT_DEV_CHECKS` and `CI`. When an override is provided, it **replaces** the process environment for these variables; it is not merged. A variable counts as **set** when it is non-empty and not `0` or `false` (case-insensitive). |
| `devChecks` | See note below | Forces the dev-time `/targets` existence check on or off. |
| `checkoutPollInterval` | 60 s | The interval at which checkout polls for a new contribution. |
| `restart` | n/a | A way to reset per-process memo state: nag runs already counted, the dev-check memo, and the `Retry-After` memo. A fresh SDK instance with a `restart: true` option, or a static reset function, both satisfy this. |

`promptForCode` receives the paste URL as its argument: `promptForCode(url)`.

**SDK error codes.** Every error thrown carries `SponsorkitError.code`, which is one of:

| Code(s) | Meaning |
|---|---|
| `invalid_config` | Missing or invalid configuration |
| `disabled` | Sponsorkit is disabled |
| `popup_blocked` | Browser only |
| `access_denied`, `invalid_state`, `provider_error` | Sign-in errors delivered to the callback; `signIn` rejects with these |
| `invalid_code` | The API rejected the code exchange (`400 invalid_code`) |
| `cancelled` | Sign-in was abandoned or cancelled: the popup was closed, or an `AbortSignal`, `CancellationToken`, `context.Context` or future-drop cancelled it |
| `timeout` | Sign-in exceeded `signInTimeout` (default 300 s) |
| `network_error` | The API couldn't be reached, or returned 5xx, 429 or an unexpected response, during `signIn` or `verifySession`. Carries `retryAfter` in seconds when the API sent `Retry-After`. |
| `session_invalid`, `targets_mismatch` | Only from `verifySession` |

`getFinancialContribution` never throws these errors (SPEC §7.2).

**Adding an identity with a dead session.** If `/auth/token` answers `401 session_invalid` while the SDK is adding an identity to a stored session, the SDK clears the stored session and retries the exchange once without `sessionToken`. A code can be reused within its lifetime, which makes the retry possible.

**Native loopback sign-in:**

1. Bind `127.0.0.1:0`.
2. Build `/connect?targets…&challenge…&delivery=loopback&redirect_uri=http://127.0.0.1:<port>/callback[&app_name]`.
3. Call `openBrowser`.
4. Wait for `GET /callback?code=…` or `?error=…`. Respond with a small HTML page saying "You can close this window", or with a `302` to `/checkout…` during checkout.
5. Exchange the code at `/auth/token`.
6. Time out after 5 minutes, or earlier if the caller cancels.

**Paste-back sign-in:** print the `/connect…&delivery=paste` URL to stderr, call `promptForCode()`, then exchange the code.

**`devChecks` default.** The check is on when `SPONSORKIT_DEV_CHECKS` is set. Otherwise only these language-specific development signals turn it on:

- JS: `process.env.NODE_ENV === "development"`.
- Python: `sys.flags.dev_mode`.

Otherwise it is off. Go, Rust and .NET have no implicit signal.

## 7.1 Normative SDK behaviour (pinned by the conformance kit)

1. **Sign-in caches the token result.** After `/auth/token`, the SDK stores `result` as its cache, with `storedAt` set to the exchange time.
2. **Fresh cache hits** return `fromCache: true`; `stale` keeps its cached value.
3. **Offline, 5xx or 429 with no cache.** The result is `{ signedIn: true, supporter: null, contributions: [], fetchedAt: null, stale: true, fromCache: false }`, and the token is kept.
4. **`Retry-After`** is honoured per process. While it applies, even `cacheTtl: 0` is served from the cache without a request.
5. **Partial outage.** The API's contributions are merged with the cached contributions for the providers listed in `unavailable`. The result has `stale: true` and `fromCache: false`.
6. **`signOut`** removes `sessionToken` and `cache` but keeps nag state.
7. **Adding an identity.** `signIn` while signed in sends `add=1` and passes the stored `sessionToken` to `/auth/token`.
8. **Checkout:**
   - When already signed in, the `/checkout` URL carries no `challenge`.
   - The baseline for detection is the result the SDK already holds. A new contribution id, or a changed contribution, counts as detected.
   - Cancellation or timeout resolves `{ status: "unknown" }`.
   - After a loopback sign-in, the browser is redirected to `<apiBaseUrl>/checkout?<checkout params>&step=choose`.
9. **Nag:**
   - `lastShown: null` makes the `orEvery` clause false.
   - `force: true` bypasses the TTY, `CI` and `SPONSORKIT_NO_NAG` checks, but not `SPONSORKIT_DISABLE`.
   - Runs are counted even when the predicate is false.
10. **Precedence:**
    - `SPONSORKIT_DISABLE` beats mock, and the `mock` option beats `SPONSORKIT_MOCK`.
    - Malformed targets throw `invalid_config` even when disabled.
    - The dev-time existence check happens on the first async call, never in the constructor.
11. **`verifySession`** compares canonical target params and touches no storage.
12. **Mock presets and their expansion rules** are defined by `sdks/conformance/fixtures/mock-presets.json` (reference implementation: `src/mock-presets.ts`). Every SDK embeds them identically.
13. **`cacheTtl`.**
    - A constructor value below 60 is raised to 60.
    - A per-call `cacheTtl` may be any value ≥ 0. `0` forces a request, unless a `Retry-After` is in force.
14. **Mock mode** touches neither the network nor the disk. Nag state lives in memory, per SDK instance.
15. **`openCheckout`'s `timeout`** covers only the polling phase. Sign-in uses `signInTimeout`. Cancellation applies to both phases.
16. **`checkoutUrl`** throws `invalid_config` for options that name an unconfigured provider or an invalid frequency, amount or currency. In Go it returns `(string, error)`. It never touches network or disk.
17. **Loopback redirect after a checkout sign-in.** The redirect carries exactly `targets`, plus `provider`, `amount`, `currency` and `frequency` when set, plus `step=choose`.

## 8. SDK local storage format

The storage directory contains one JSON file per target set, named `<targets_hash>.json`:

When signed out, `sessionToken` and `cache` may be absent or `null`.

```json
{ "v": 1, "sessionToken": "sks_…", "cache": { "result": { …ContributionResult… }, "storedAt": "ISO-8601" }, "nags": { "<id>": { "runs": 3, "lastShown": "ISO-8601" | null } } }
```

- **Writes** go to `<file>.<random>.tmp` first, which is then renamed over the target file.
- **Permissions:**
  - The directory is created with mode `0700` and files with `0600`.
  - On Windows, the default user profile ACL applies.
- **Browser:** uses the `localStorage` key `sponsorkit:<targets_hash>`, holding the same JSON.

## 9. Conformance fake server

The fake server is run with `bun sdks/conformance/server.ts [--port N]`. It prints `LISTENING <port>` on stdout once it is ready.

- **API:** implements §3 and the `/connect` and `/checkout` redirects needed for non-interactive tests.
- **Scenario control:** `POST /__control` with `{ scenario, … }` sets the behaviour. `GET /__control/requests` returns a log of requests received.
- **Scenarios and expected results:** listed in `sdks/conformance/scenarios.json`. Each SDK implements one test per scenario in its own test framework.
