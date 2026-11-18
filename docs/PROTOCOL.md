# Sponsorkit wire protocol (normative)

This document is the contract between the Worker (`app/`), the static pages (`web/`), the conformance fake server (`sdks/conformance/`) and every SDK.

- `docs/SPEC.md` explains *why*. This file defines *exactly what goes over the wire*.
- TypeScript schemas live in `packages/shared/src`. Every other language mirrors them.
- TypeScript constants for the URLs and paths below live in `packages/shared/src/urls.ts`.

## 0. Deployment: site and API

Sponsorkit is served from two places. They are separate origins (cross-site) by default:

| Part | What | Default base URL | Paths |
|---|---|---|---|
| **Site** | The static Next.js export of `web/`: landing, docs, `/connect/`, `/connect/done/`, `/checkout/`, `/checkout/thanks/`, 404. Hosted on GitHub Pages as a project site. | `https://sponsorkit.github.io/sponsorkit.io` (origin `https://sponsorkit.github.io`, base path `/sponsorkit.io`) | Page paths are relative to the site base URL and **always end in `/`** (GitHub Pages serves directories). |
| **API** | The Cloudflare Worker (`app/`), API only, no static assets. | `https://api.sponsorkit.io` (an origin, no path) | `/api/v1/…` and `/api/oauth/…`, relative to the API origin. |

- **Site base URL** (`SITE_BASE_URL`, SDK `siteBaseUrl`): origin plus optional base path, with no trailing slash. Page URLs are `<site base URL><page path>`, e.g. `https://sponsorkit.github.io/sponsorkit.io/connect/?targets=…`.
- **Site origin** (`SITE_ORIGIN`): the origin of the site base URL, e.g. `https://sponsorkit.github.io`. It is what browsers send in `Origin` and what `postMessage` reports as `event.origin`.
- **API origin** (`PUBLIC_ORIGIN`, SDK `apiBaseUrl`): scheme, host and port only.
- **Single-origin self-hosting** remains supported: serve the site and the API behind one origin and set `SITE_ORIGIN` = API origin (and `SITE_BASE_URL` = that origin plus the site's base path, if any). Nothing else changes.
- In this document, **"site page `/x/`"** means `<site base URL>/x/`, and **"API path `/api/…`"** means `<API origin>/api/…`.

### 0.1 Worker configuration (vars, not secrets)

| Var | Production value (`app/wrangler.jsonc`) | Meaning | Fallback when unset |
|---|---|---|---|
| `PUBLIC_ORIGIN` | `https://api.sponsorkit.io` | The API origin. Used for the provider callback URLs. | The request's origin. |
| `SITE_BASE_URL` | `https://sponsorkit.github.io/sponsorkit.io` | Where deliveries, consent links and docs links point. | `PUBLIC_ORIGIN` (single origin). |
| `SITE_ORIGIN` | `https://sponsorkit.github.io` | The only `Origin` accepted by `POST /api/oauth/:provider/start` (§4.3). | The origin of `SITE_BASE_URL`. |

- Trailing slashes are trimmed. `SITE_ORIGIN` must be a bare origin (no path) and must equal the origin of `SITE_BASE_URL`; otherwise sign-in fails closed with the HTML "Sign-in unavailable" page (`500`).
- The API hostname is configurable: change `PUBLIC_ORIGIN`, the Worker's custom-domain route, and the OAuth apps' callback URLs together.

### 0.2 Site configuration (build time)

| Variable | Production value | Meaning |
|---|---|---|
| `BASE_PATH` | `/sponsorkit.io` | Next.js `basePath`. |
| `TRAILING_SLASH` | `1` | Export every page as `<path>/index.html`. |
| `NEXT_PUBLIC_SPONSORKIT_API_BASE` | `https://api.sponsorkit.io` (the default when the variable is undefined) | The API origin the pages call. **Empty string = same origin** (single-origin self-hosting): the pages use root-relative `/api/…` URLs. |

The pages call `GET /api/v1/targets` with `fetch` (CORS, no credentials, §3) and start sign-in with a top-level form POST to the API (§4.3). They never need cookies of their own.

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
- **Errors** are `application/problem+json`: `{ type, title, status, code, detail? }`. `type` is `<SITE_BASE_URL>/docs/reference-http/http-api/#errors`, which by default is `https://sponsorkit.github.io/sponsorkit.io/docs/reference-http/http-api/#errors`. Clients must not branch on `type`; they branch on `code`. `code` is one of:
  - `invalid_request`
  - `invalid_target`
  - `invalid_code`
  - `session_invalid`
  - `rate_limited`
  - `not_found`
  - `internal`
- **Request ID:** every response carries `Sponsorkit-Request-Id`.
- **`429` responses** carry `Retry-After`, in seconds.
- **CORS (`/api/v1/*` only):** `Access-Control-Allow-Origin: *`, with no credentials. The allowed headers are `Authorization` and `Content-Type`. The exposed headers are `Sponsorkit-Session`, `Sponsorkit-Request-Id` and `Retry-After`. This is unchanged by the split: the site's pages (on the site origin) call `/api/v1/targets` cross-origin under this policy, exactly like any third-party app.
- **No CORS on `/api/oauth/*`.** Those endpoints are only reached by top-level browser navigations (a form POST and provider redirects), never by `fetch`, and send no `Access-Control-*` headers.
- **No static assets on the API.** Paths outside `/api/*` return `404 not_found` as problem+json.

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

The pages (`/connect/`, `/connect/done/`, `/checkout/`, `/checkout/thanks/`) are on the **site**. The OAuth endpoints (`/api/oauth/:provider/start`, `/api/oauth/:provider/callback`) are on the **API** (§0).

### 4.1 Common parameters

These are used as query parameters by `/connect/` and `/checkout/`, and as form fields by `POST /api/oauth/:provider/start`. All are lowercase snake_case.

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

**Rules for all site pages that start sign-in (`/connect/`, `/checkout/`):**

- **Referrer policy.** They must use the referrer policy `strict-origin` (for example `<meta name="referrer" content="strict-origin">`). It keeps the page's path and query out of `Referer`, and, unlike `no-referrer` or `same-origin`, it lets the browser send the real `Origin` on the cross-origin form POST. Under `no-referrer` or `same-origin` the browser sends `Origin: null` and the Worker rejects the start (§4.3).
- **No framing.** GitHub Pages can't send `X-Frame-Options` or `Content-Security-Policy: frame-ancestors`. So when `window.top !== window.self`, the pages must not render the provider buttons, and must instead show a link that opens the same URL in a new top-level window. The Worker also rejects framed starts (§4.3).

### 4.2 `/connect/` (site page)

1. The page validates the params. If they are invalid, it shows an error.
2. It loads `GET /api/v1/targets` and shows the consent screen. The screen includes:
   - each target's avatar and name;
   - who is asking: the `origin` for `web_message`, the host of `redirect_uri` for `redirect`, or `app_name` labelled "says it is" for `loopback` and `paste`;
   - the consent text from SPEC §5.4;
   - one button per provider that is present in the target set.
3. A provider button submits a **top-level form POST** to API path `/api/oauth/<provider>/start` (§4.3):
   - `<form method="post" action="<API origin>/api/oauth/<provider>/start" enctype="application/x-www-form-urlencoded">`, with no `target` (or `target="_self"`). With `NEXT_PUBLIC_SPONSORKIT_API_BASE` empty, the action is `/api/oauth/<provider>/start` on the same origin.
   - One hidden field per parameter that is present: `targets`, `challenge`, `delivery`, `origin`, `redirect_uri`, `app_name`, `provider`, `add`, and `continue` from `/checkout/` (§4.6). The values are exactly what the query parameters would have been.
   - Navigating with a GET link is no longer allowed (§4.3).

### 4.3 `POST /api/oauth/:provider/start`

**Request:** a top-level form POST from a site page, with a body of type `application/x-www-form-urlencoded` holding the §4.1 fields plus optional `continue`. The query string is ignored.

0. **Method.** Any method other than `POST` (including `GET` and `HEAD`) returns an HTML `405` with `Allow: POST`. It sets no cookie and does not redirect. The page explains that sign-in starts on the consent screen and links to it, built from the request's query parameters as in step 2 below.
1. **Parse and validate** the body. The content type must be `application/x-www-form-urlencoded`, and the body must be at most 8 KiB. The same rules apply as in §4.1, and the `provider` must be in the target set. Anything invalid returns `400` as an HTML error page.
2. **Check the request came from the consent screen** (see "Security: cross-site consent start" below).
   - The request is accepted only when its `Origin` header is present and **exactly equals** `SITE_ORIGIN` (§0.1): a byte-wise comparison of the serialized origin, so scheme, host and port must all match. A missing `Origin`, `Origin: null`, or any other value is rejected.
   - It is also rejected when `Sec-Fetch-Dest` is present and is not `document`, so a start submitted inside a frame is refused.
   - A rejected start gets an HTML `403`. It sets no cookie, creates no state and does not redirect. The page links to the consent page: site page `/connect/?<same params>`, or `/checkout/?<continue>&<sign-in params>` when `continue` is present (sign-in params already in `continue` are not repeated).
3. **Generate** a 32-byte `browser_nonce` and set it as a cookie **on the API origin**, in this POST's response: `__Host-sk_nonce=<base64url>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=1200`. That is the state lifetime plus 600 s of grace, so an expired state can still be reported as `invalid_state`.
   - Browsers store it: a cookie set by the response to a top-level navigation is same-site with that navigation's URL, the API origin.
   - Browsers send it to the callback: the provider's redirect to the callback is a top-level `GET` navigation to the API origin, which `SameSite=Lax` allows.
4. **Create a sealed state** (§5) containing the provider, the targets, the delivery params, `sha256(browser_nonce)`, a provider PKCE verifier, an optional `continue` value (see §4.6), and `exp = now + 600 s`.
5. **Redirect `302`** to the provider's authorize URL with `state=<sealed>`. The browser follows a `302` after a POST with a `GET`. `<origin>` is the API origin (`PUBLIC_ORIGIN`), so the callback URLs registered with the providers are on the API domain:
   - **GitHub:** `https://github.com/login/oauth/authorize?client_id=…&redirect_uri=<origin>/api/oauth/github/callback&scope=read:user%20read:org&state=…&code_challenge=…&code_challenge_method=S256&allow_signup=false`
   - **Open Collective:** `https://opencollective.com/oauth/authorize?client_id=…&response_type=code&redirect_uri=<origin>/api/oauth/opencollective/callback&scope=orders%20incognito&state=…&code_challenge=…&code_challenge_method=S256`

#### Security: cross-site consent start

**What the check protects.** The consent screen is the only place a supporter sees who is asking and which targets will be checked (SPEC §5.4). Providers don't prompt again for an OAuth app the supporter has already authorized. So a start that skips the consent screen could get a sign-in code delivered to an attacker-chosen `origin` or `redirect_uri` without the supporter ever seeing it. Delivering the code is harmless only together with PKCE when the attacker can't drive the start; the check makes sure a person on the consent screen did.

**Why an `Origin`-checked POST is sound.**

- **It can't be forged from another origin.** Browsers set `Origin` themselves; page scripts can't set or change it (it is a forbidden request header). A page on any other origin that submits a form, or a script that calls `fetch`, produces that page's own origin, never `SITE_ORIGIN`. Only a document on the site origin can produce a request the Worker accepts.
- **Browsers always send `Origin` on a cross-origin POST navigation.** The Fetch standard adds `Origin` to every request whose method is neither `GET` nor `HEAD`, form navigations included. Its value is `null` only under the referrer policies `no-referrer`, `same-origin` (for a cross-origin target), or a downgrade from `https` to `http`. That is why the consent pages must use `strict-origin` (§4.1), and why the API must be `https`.
- **No `Origin` means rejected.** Very old browsers, non-browser clients, and links opened directly (a pasted URL, a bookmark, a link from another site) send no `Origin` or a `GET`. They all fail closed with the `403` or `405` page, which links to the consent screen. Nothing is lost: the supporter reviews the consent screen and continues from there.
- **`GET` is gone.** Links and redirects can only produce `GET` navigations. Without a `GET` start, they can't start sign-in at all.
- **The rest is unchanged.** The sealed state, the nonce cookie binding the state to the browser, provider PKCE and Sponsorkit PKCE work exactly as before. The Origin check only replaces the `Sec-Fetch-Site` check, which can't work across sites: from the site, a start is always `cross-site`.
- **The cookie is still first-party.** The nonce cookie lives on the API origin, which sets it and reads it. The site never needs it. Since it is set and read only in top-level navigations, third-party-cookie blocking doesn't affect it.

**Residual risks.**

- **Every document on `SITE_ORIGIN` is trusted.** On GitHub Pages, `https://sponsorkit.github.io` is shared by the `sponsorkit` account's user site and **every** project site of that account. Any of them could submit a start. So only trusted repositories may publish to GitHub Pages under that account. Moving the site to its own custom domain removes the risk; then update `SITE_ORIGIN` and `SITE_BASE_URL`. An XSS bug anywhere on the site origin has the same effect.
- **Framing.** GitHub Pages can't send anti-framing headers. A framed consent page could be overlaid to trick a click. Two things mitigate it: the pages hide the provider buttons when framed (§4.1), and the Worker rejects `Sec-Fetch-Dest` other than `document`. Browsers without Fetch Metadata that also run the page with scripts disabled remain exposed. Even then, a cookie set in a cross-site frame is blocked by `SameSite`, and the providers refuse to be framed, so the flow can't complete inside a frame.
- **Social engineering.** An attacker can still send a supporter to a real consent page with attacker-chosen parameters. That is the existing threat model: the consent page shows who is asking (`origin`, the `redirect_uri` host, or `app_name` labelled "says it is") and the targets, and the supporter decides.
- **Proxies that strip `Origin`.** Rare middleboxes or privacy extensions that strip or null `Origin` break sign-in for that supporter. It fails closed and doesn't open a hole.

### 4.4 `GET /api/oauth/:provider/callback?code=…&state=…`

This is on the API origin. The provider redirects here with a top-level `GET`, so the `SameSite=Lax` nonce cookie is sent.

1. **Check the state.** Unseal it, check that it hasn't expired, and check that `sha256(cookie nonce)` matches the value in the state. Then clear the cookie.
2. **Get the provider token.** Exchange the provider code (with the provider PKCE verifier) for an access token, then fetch the identity:
   - **GitHub:** `viewer { databaseId login }`.
   - **Open Collective:** `me { id slug }`. The token expiry is `now + expires_in`.
3. **Create a sealed sign-in code** (§5): `skc_…`.
4. **Deliver it** with a `302` to the location below. The `/connect/done/` deliveries go to the **site** (`<SITE_BASE_URL>/connect/done/#…`), not to the API.

| Delivery | Location |
|---|---|
| `web_message` | `<SITE_BASE_URL>/connect/done/#code=<skc>&origin=<urlencoded origin>[&continue=<urlencoded continue>]` |
| `redirect` | `<redirect_uri>` with the query parameter `sponsorkit_code=<skc>` appended |
| `loopback` | `<redirect_uri>?code=<skc>` |
| `paste` | `<SITE_BASE_URL>/connect/done/#paste=<skc>[&continue=…]` |

**Failures:**

- **The user denied access at the provider** (`error=access_denied`), or the state can be decrypted but has expired. The Worker delivers an error the same way it would deliver a code:
  - `web_message`: `<SITE_BASE_URL>/connect/done/#error=<code>&origin=…`
  - `redirect`: `sponsorkit_error=<code>`
  - `loopback`: `?error=<code>`
  - `paste`: `<SITE_BASE_URL>/connect/done/#error=<code>`

  `<code>` is one of `access_denied`, `invalid_state` or `provider_error`.
- **The nonce cookie doesn't match the state, or the state can't be decrypted** (a tampered state carries no delivery params), **or the provider doesn't match.** The Worker shows an HTML error page (on the API origin) and delivers nothing. Its links point to the site.
- **Order of checks:** the nonce cookie is verified before any delivery, including error deliveries.

### 4.5 `/connect/done/` (site page)

The page reads `location.hash` first and then removes it with `history.replaceState`.

- **`code` with `origin`.** Calls `window.opener.postMessage({ type: "sponsorkit:code", code }, origin)`.
  - If there is no `continue`, it closes itself after about 300 ms. If it can't close, it shows "You can close this window."
  - If `continue` is present, it navigates to site page `/checkout/?<continue>&step=choose`.
- **`paste`.** Shows the code in a monospace box with a copy button, plus the text "Paste this into the app (valid for 10 minutes)".
  - If `continue` is present, it also shows a **Continue to checkout** link to site page `/checkout/?<continue>&step=choose`.
- **`error`.** If `origin` is set and there is an opener, it posts `{ type: "sponsorkit:error", error }` to that origin. In every case it shows a message.
- Messages posted from this page carry `event.origin` = the site origin, which is what the browser SDK checks (§7).

### 4.6 `/checkout/` (site page)

**Parameters:**

| Group | Params |
|---|---|
| From §4.1 | `targets`, `challenge?`, `delivery?`, `origin?`, `redirect_uri?`, `app_name?` |
| Checkout options | `amount?` (minor units, integer), `currency?` (ISO 4217), `frequency?` (`one_time` \| `monthly` \| `yearly`), `provider?` |
| Control | `step?` (`choose`) |

**Flow:**

1. **Sign in first, if needed.** If `challenge` is present and `step` is not `choose`, the page needs a sign-in first. It does what `/connect/` does: show consent, then start provider OAuth with all its own params. It passes `continue=<checkout query string without challenge, delivery, origin, redirect_uri>` as a form field of the `POST /api/oauth/:provider/start` (§4.2 step 3), so that after sign-in the user comes back to site page `/checkout/?<continue>&step=choose`.
   - With `loopback` delivery, the SDK's loopback server responds to `/callback` with a `302` to `<siteBaseUrl>/checkout/?<checkout params>&step=choose` (§7.1 item 17).
2. **Choose a provider.** The page loads API path `/api/v1/targets` and computes eligibility using the rules in §6. If exactly one provider is eligible, or `provider` is given and eligible, it redirects there immediately. Otherwise it shows the chooser, with a reason for each disabled option.
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

## 6. Checkout eligibility (identical in `/checkout/` and SDK docs)

**Inputs:** `amount?`, `currency?`, `frequency?`, and the `TargetInfo` of each target.

A provider is **eligible** if all of these hold:

1. **Target:** `exists` is true.
2. **Frequency:** if `frequency` is given, it is in `TargetInfo.frequencies`.
   - GitHub: `["monthly", "one_time"]`.
   - Open Collective: `["one_time", "monthly", "yearly"]`.
3. **Currency:** if `currency` is given, it equals `TargetInfo.currency`. GitHub is always `USD`.
4. **Tiers (GitHub only):** at least one tier matches the frequency, or `monthly` when no frequency is given. A GitHub target with no matching tier is ineligible.

**When the requested `provider` isn't eligible** but another provider is, `/checkout/` shows the chooser with a notice and the reasons. It never silently switches provider.

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
  - `redirect=<site base URL>/checkout/thanks/`, URL-encoded. By default that is `https://sponsorkit.github.io/sponsorkit.io/checkout/thanks/`. The page builds it from its own site base URL (`location.origin` + `NEXT_PUBLIC_BASE_PATH`).
- **Checkout page URLs** built by SDKs (`openCheckout`, `checkoutUrl()`) are `<siteBaseUrl>/checkout/?<params>`. Sign-in URLs are `<siteBaseUrl>/connect/?<params>`.

## 7. SDK behaviour hooks (required for testability)

Every SDK must accept the following options, using names idiomatic to its language:

| Option | Default | Used by |
|---|---|---|
| `apiBaseUrl` | `https://api.sponsorkit.io` | The API origin, used for every API call (`/api/v1/…`). The conformance server runs on `http://127.0.0.1:<port>`. |
| `siteBaseUrl` | `https://sponsorkit.github.io/sponsorkit.io`, **or `apiBaseUrl` when `apiBaseUrl` is set and `siteBaseUrl` isn't** | The site base URL (origin plus optional base path), used for every page URL: `/connect/`, `/checkout/`, `checkoutUrl()`, and the loopback checkout redirect. |
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

**Base URL rules.**

- **Defaulting.** `apiBaseUrl` defaults to `https://api.sponsorkit.io`. `siteBaseUrl` defaults to `apiBaseUrl` when `apiBaseUrl` was set explicitly, and otherwise to `https://sponsorkit.github.io/sponsorkit.io`. This keeps single-origin self-hosting and the conformance tests working with `apiBaseUrl` alone. An empty string counts as unset. (Reference: `resolveBaseUrls` in `packages/shared/src/urls.ts`.)
- **Normalization.** Trailing slashes are trimmed from both. `apiBaseUrl` is an origin. `siteBaseUrl` may carry a path.
- **Page paths** always use the trailing-slash form: `<siteBaseUrl>/connect/?…`, `<siteBaseUrl>/checkout/?…`.
- **postMessage origin (browser SDK).** The SDK accepts a `message` event only when `event.origin` exactly equals the **origin of `siteBaseUrl`** (for example `https://sponsorkit.github.io`), never the API origin. It also checks `event.source` is the popup it opened, then validates the payload against `WindowMessage`. Any other message is ignored.

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
2. Build `<siteBaseUrl>/connect/?targets…&challenge…&delivery=loopback&redirect_uri=http://127.0.0.1:<port>/callback[&app_name]`.
3. Call `openBrowser`.
4. Wait for `GET /callback?code=…` or `?error=…`. Respond with a small HTML page saying "You can close this window", or with a `302` to `<siteBaseUrl>/checkout/?…&step=choose` during checkout (§7.1 item 17).
5. Exchange the code at `/auth/token`.
6. Time out after 5 minutes, or earlier if the caller cancels.

**Paste-back sign-in:** print the `<siteBaseUrl>/connect/?…&delivery=paste` URL to stderr, call `promptForCode()`, then exchange the code.

**`devChecks` default.** The check is on when `SPONSORKIT_DEV_CHECKS` is set. Otherwise only these language-specific development signals turn it on:

- JS: `process.env.NODE_ENV === "development"`.
- Python: `sys.flags.dev_mode`.

Otherwise it is off. Go, Rust and .NET have no implicit signal.

## 7.0 Robustness rules (all SDKs)

**HTTP**

- **Request timeout.** Every HTTP request has a 30 s timeout, configurable with `requestTimeout` (seconds; `0` disables it). A timeout counts as a network error: `getFinancialContribution` serves the stale cache, while `signIn` and `verifySession` throw `network_error`.
- **Unexpected 400.** A `400` from `/auth/token` with any code other than `invalid_code` maps to `network_error`.
- **`Retry-After`.** Values that aren't finite are ignored. Values are clamped to at most 24 h, and must never crash or overflow.

**Loopback sign-in**

- **Malformed callbacks.** A `GET /callback` with neither a non-empty `code` nor a non-empty `error` gets a `400` response. The receiver ignores it and keeps waiting.
- **Bind failure.** If the receiver can't bind to `127.0.0.1`, `auto` sign-in falls back to paste-back.
- **Browser launch.** The SDK accepts the callback while `openBrowser` is still running. A system launcher that exits non-zero counts as "opening the browser failed", which triggers the `auto` fallback. A launcher still running after about 1.5 s counts as opened.

**Storage**

- **Reading never throws.** A storage document that can't be parsed counts as absent. So does any malformed part of one: invalid UTF-8, an unexpected type, a bad date, a `null` list, a non-object contribution, or a token that isn't `sks_` followed by printable ASCII.
- **Timestamps.** ISO-8601 timestamps with a fractional part of any length must be accepted.
- **Write failures.** Failing to persist a session in `signIn`, or to clear one in `signOut`, throws `invalid_config`.
- **Refresh races.** A refresh writes back its cache and any renewed token only if the stored token is still the one the request used. A `401` clears only that token.
- **No config directory.** If no per-user config directory can be determined (for example, `HOME` is unset), the SDK falls back to in-memory storage. It never writes to the current working directory and never fails construction.

**Paste-back**

- **Stdin can't be cancelled.** The default stdin prompt can't cancel its blocking read. After a cancelled or timed-out paste-back, the next line typed may go to that pending read. Apps that read stdin themselves should supply `promptForCode`.

## 7.1 Normative SDK behaviour (pinned by the conformance kit)

1. **Sign-in caches the token result.** After `/auth/token`, the SDK stores `result` as its cache, with `storedAt` set to the exchange time.
2. **Fresh cache hits** return `fromCache: true`; `stale` keeps its cached value.
3. **Offline, 5xx or 429 with no cache.** The result is `{ signedIn: true, supporter: null, contributions: [], fetchedAt: null, stale: true, fromCache: false }`, and the token is kept.
4. **`Retry-After`** is honoured per process. While it applies, even `cacheTtl: 0` is served from the cache without a request.
5. **Partial outage.** The API's contributions are merged with the cached contributions for the providers listed in `unavailable`. The result has `stale: true` and `fromCache: false`.
6. **`signOut`** removes `sessionToken` and `cache` but keeps nag state.
7. **Adding an identity.** `signIn` while signed in sends `add=1` and passes the stored `sessionToken` to `/auth/token`.
8. **Checkout:**
   - The checkout URL is `<siteBaseUrl>/checkout/?…`. When already signed in, it carries no `challenge`.
   - The baseline for detection is the result the SDK already holds. A new contribution id, or a changed contribution, counts as detected.
   - Cancellation or timeout resolves `{ status: "unknown" }`.
   - After a loopback sign-in, the browser is redirected to `<siteBaseUrl>/checkout/?<checkout params>&step=choose`. That is the site, not the API, unless `siteBaseUrl` defaulted to `apiBaseUrl`.
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
16. **`checkoutUrl`** returns `<siteBaseUrl>/checkout/?<params>`. It throws `invalid_config` for options that name an unconfigured provider or an invalid frequency, amount or currency. In Go it returns `(string, error)`. It never touches network or disk.
17. **Loopback redirect after a checkout sign-in.** The `302` goes to `<siteBaseUrl>/checkout/?…&step=choose`. Its query carries exactly `targets`, plus `provider`, `amount`, `currency` and `frequency` when set, plus `step=choose`.

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

- **Single origin.** Tests pass only `apiBaseUrl`, so `siteBaseUrl` defaults to the fake server's origin. The fake server serves both the API and the site paths.
- **API:** implements §3, the `/connect/` and `/checkout/` redirects needed for non-interactive tests (the trailing-slash forms; it may also accept the forms without a slash), and the `/checkout/` landing after a loopback redirect.
- **Scenario control:** `POST /__control` with `{ scenario, … }` sets the behaviour. `GET /__control/requests` returns a log of requests received.
- **Scenarios and expected results:** listed in `sdks/conformance/scenarios.json`. Each SDK implements one test per scenario in its own test framework.
