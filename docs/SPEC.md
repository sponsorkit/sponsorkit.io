# Sponsorkit: product & technical specification

> Status: **DRAFT v5, awaiting approval.** Nothing below is built yet.
> Last updated: 2026-11-16.
>
> **What changed in v5:** Stripe Connect was removed as a provider. That also removes email identities, magic links and transactional email.
>
> **What changed in v4:**
> - The backend is TypeScript on Cloudflare Workers (free plan).
> - Data is fetched **on demand** from providers. There are no webhooks of any kind and no background sync.
> - Maintainer setup is reduced to a few clicks.

## 1. What Sponsorkit is

Sponsorkit lets an open source maintainer build financial contributions directly into their software.

A maintainer installs a Sponsorkit SDK (npm, NuGet, PyPI, Go, crates.io) and can then:

1. **Ask what the current user has contributed** with `getFinancialContribution()`.
2. **Let the user start contributing** with `openCheckout({ amount, frequency, … })`, which opens a checkout hosted by Sponsorkit.
3. **Decide what to do with that information.** For example: show an ad if the user gives less than $5/month, show a "consider sponsoring" nag every N runs, or unlock a feature. Sponsorkit reports facts. The maintainer writes the rules.

Contributions come from **payment providers**. v1 supports:

| Provider | Recurring (Sponsorkit can preset) | One-time | Custom amount at checkout | Currency | Supporter identity |
|---|---|---|---|---|---|
| GitHub Sponsors | monthly | ✅ | Tier-based (custom-amount tiers if the maintainer enabled them) | USD only | GitHub account |
| Open Collective | monthly, yearly | ✅ | ✅ (`?amount=&interval=`) | The collective's currency | Open Collective account |
| Patreon | monthly (the patron can switch to annual on Patreon) | ❌ (Patreon has no one-time payments) | Tier-based | The campaign's currency (tiers are priced in USD) | Patreon account |

### 1.1 Design principles

- **Simple to set up.** A maintainer goes from zero to a working key in a couple of minutes (§2.1). They never configure webhooks, callback URLs or provider API keys.
- **On demand, not event-driven.** Sponsorkit asks the provider when an app asks Sponsorkit, then caches the answer. There are no webhooks in either direction and no background sync.
- **Facts, not policy.** Contributions are returned **per provider as raw history**. Sponsorkit never aggregates them, converts currencies, or decides who "counts".
- **Never break the host app.** SDKs never throw because Sponsorkit or a provider is down (§9.2).

### 1.2 Non-goals (v1)

- **Webhooks.** None inbound and none outbound.
- **Tamper-proofing of client-side checks.** The software is open source, so anyone can patch out a check. Server-side verification with a secret key is available for SaaS backends that need a trustworthy answer.
- **Payment processing.** Sponsorkit never handles money. Every payment happens on the provider's own site. Sponsorkit is free.
- **Bountyhunt.** Removed entirely.

## 2. Actors & vocabulary

| Term | Meaning |
|---|---|
| **Maintainer** | The person who builds the OSS software. Signs in to `sponsorkit.io` with **GitHub only**. |
| **Project** | One piece of software that integrates Sponsorkit. A project has: <ul><li>a **live** and a **test** public key (`pk_live_…`, `pk_test_…`);</li><li>optional secret keys (`sk_live_…`, `sk_test_…`) for server-side verification.</li></ul> |
| **Mode** | `live` or `test`. Every key, session, connection and checkout belongs to exactly one mode, and modes never mix. |
| **Provider connection** | Where the maintainer receives money: a GitHub Sponsors listing (user or org), an Open Collective collective, a Patreon campaign, or the built-in **Test provider** (test mode only). A project picks which connections count. |
| **Supporter** | An end-user of the software. One Sponsorkit person with one or more **linked identities** (GitHub, Open Collective, Patreon). |
| **Session** | A supporter signed in to one project, in one mode, from one app instance. The SDK holds an opaque token, `sks_…`. |
| **Contribution** | One sponsorship, order, membership or subscription from a **sponsor entity** to a provider connection, normalized into a common shape. |
| **Sponsor entity** | Who actually pays: a user, or an organization. A contribution reaches a supporter either **directly** or **via an organization** the supporter belongs to (§6.5). |

### 2.1 Maintainer setup (the whole thing)

1. Sign in at `sponsorkit.io` with GitHub, then click **New project** and name it.
2. Click **Connect** next to each provider you want. Every step is optional:
   - **GitHub Sponsors:** pick your own user or an org you administer. There is no extra sign-in, because you're already signed in with GitHub.
   - **Open Collective / Patreon:** one OAuth click. This proves you own the collective or campaign and loads your tiers.
3. Copy the public key into your code. For browser apps, also add the site's origin to **Allowed origins**.

There is nothing else to configure.

## 3. Architecture

```
                       sponsorkit.io  (one Cloudflare Worker, free plan)
                ┌──────────────────────────────────────────────────────────────────┐
 Supporter ───▶ │ static assets (Next.js static export): /, /docs, /dashboard,      │ ◀── Maintainer
 (browser)      │   /connect, /device, /checkout, /c, /account   ← served free,     │
                │                                                  no Worker CPU    │
 SDK in app ──▶ │ /api/v1/*      public API (Hono)                                 │
 (pk_ + sks_)   │ /api/web/*     dashboard + account API (cookie session, same-origin)
 SaaS backend ▶ │ /api/oauth/*   provider OAuth callbacks                           │
 (sk_)          │ cron (daily)   delete expired rows                                │
                └───────┬──────────────────────────┬───────────────────────────────┘
                        │ Neon serverless driver    │ fetch (on demand, cached)
                        ▼ (HTTP)                    ▼
                  Neon Postgres (free)    GitHub GraphQL · Open Collective GraphQL ·
                                          Patreon API v2
```

- **Runtime**
  - TypeScript on **Cloudflare Workers**, with the **Hono** framework.
  - Hono also runs unchanged on Node and Bun, so self-hosting stays possible.
  - Bun is used for local development, scripts and tests.
- **One Worker, one domain**
  - The Worker serves the static site and the API under `/api`.
  - Static asset requests don't invoke the Worker. They are free and don't count against the 100k requests/day.
  - Dashboard and account calls are same-origin, so cookies are host-only `__Host-` cookies and CORS isn't needed for them.
- **Web**
  - **Next.js static export** (`output: "export"`).
  - Marketing pages and docs (MDX) are pre-rendered.
  - The dashboard and hosted supporter pages are client-rendered and call `/api/web` and `/api/v1`.
  - Dynamic IDs travel as query parameters (`/checkout?id=cs_…`), because static export cannot pre-render unknown paths.
- **Database**
  - **Neon Postgres** (free tier) through the Neon serverless driver over HTTP, with **Drizzle** ORM and migrations.
  - HTTP avoids Hyperdrive's 100k queries/day free cap. Every query is a Worker subrequest, so handlers keep query counts low (≤ 5 per request).
- **Background work**
  - None, apart from one daily **Cron Trigger** that deletes expired sessions, codes, checkouts and cache rows.
- **Secrets**
  - Stored as Wrangler secrets.
  - Provider tokens are encrypted with AES-256-GCM via Web Crypto. Each ciphertext records a `key_version`, and the row ID is used as associated data (AAD).
  - Secret keys, session tokens and codes are stored as SHA-256 hashes plus a display prefix, and compared in constant time.
- **Rate limiting**
  - The Workers Rate Limiting binding, keyed per IP, per public key and per secret key.
  - Plus one free Cloudflare WAF rate-limit rule on `/api/v1/auth/*` as a backstop.
  - *To verify during the build:* whether the binding is available on the free plan. If not, use the WAF rule plus a per-isolate limiter.

### 3.1 Free-plan budget

| Workers Free limit | How Sponsorkit stays inside it |
|---|---|
| 100k Worker requests/day | Static assets don't count. SDKs cache locally (§9.4), so a typical app makes ~1 API call per user per hour at most. |
| **10 ms CPU per request** | Handlers are I/O-bound; time spent waiting on fetch or the database doesn't count as CPU. There is no server-side rendering. |
| 50 subrequests per request | A contribution refresh costs ≤ 5 DB queries plus ≤ 1–2 calls per connected provider, with GitHub org queries batched into one GraphQL request. Dashboard supporter lists are paginated across requests. |
| 5 Cron Triggers | Sponsorkit uses 1. |

If Sponsorkit outgrows this, switching to Workers Paid ($5/mo) is a plan change only. No code changes.

### 3.2 Repository layout (Bun workspaces)

```
app/                     Cloudflare Worker: Hono API + static assets binding + cron
  src/
    api/v1/              public API
    api/web/             dashboard + account API
    oauth/               provider OAuth flows
    providers/           github, opencollective, patreon, test adapters
    db/                  Drizzle schema + migrations
  test/                  Vitest; Postgres service container; provider APIs faked with MSW
web/                     Next.js static export (site, docs, dashboard, hosted pages) + Playwright e2e
packages/shared/         Zod schemas & types shared by app, web and the JS SDK; generates OpenAPI
sdks/
  js/                    @sponsorkit/sdk  (entry points: default, /node, /server, /elements)
  dotnet/                Sponsorkit (NuGet; netstandard2.0 + net8.0)
  python/                sponsorkit (PyPI; 3.10+)
  go/                    module github.com/sponsorkit/sponsorkit.io/sdks/go
  rust/                  sponsorkit (crates.io; edition 2024)
  conformance/           fake API server + fixtures + scenarios every SDK must pass
openapi/sponsorkit.v1.yaml     generated from packages/shared, committed, diffed in CI
docs/                    this spec + ADRs
.github/workflows/       CI per component, deploy, trusted publishing
```

## 4. Data model (Postgres)

Rows marked **(m)** carry a `mode` column (`live`/`test`), and every query filters on it.

There is **no contributions table**. Provider answers are cached per (supporter identity, connection) in `contribution_cache`.

| Table | Key columns |
|---|---|
| `maintainers` | `id`, `github_user_id` (unique, immutable), `github_login`, `email` |
| `projects` | `id`, `maintainer_id`, `slug` (unique), `name`, `icon_url`, `public_key_live`, `public_key_test`, `allowed_origins text[]`, `redirect_uris text[]`, `checkout_config jsonb` |
| `secret_keys` (m) | `id`, `project_id`, `prefix`, `hash`, `name`, `last_used_at`, `revoked_at` |
| `provider_connections` (m) | `id`, `maintainer_id`, `provider`, `external_account_id`, `handle`, `currency`, `tiers jsonb` (id, name, amount, currency, frequency, url), `access_token_enc`, `refresh_token_enc`, `expires_at`, `token_status`, `metadata jsonb`, `refreshed_at` |
| `project_connections` | `project_id`, `connection_id` |
| `supporters` | `id`, `visibility` (`public`/`private`, default `public`) |
| `supporter_identities` | `id`, `supporter_id`, `provider` (`github`/`opencollective`/`patreon`/`test`), `external_user_id` (immutable provider ID), `handle`, `access_token_enc`, `refresh_token_enc`, `expires_at`, `token_status`; **unique(provider, external_user_id)** |
| `contribution_cache` (m) | `identity_id`, `connection_id`, `contributions jsonb` (normalized §6.1 items), `fetched_at`, `error?`; **pk(identity_id, connection_id)** |
| `sessions` (m) | `id`, `supporter_id`, `project_id`, `token_hash`, `client_kind` (`browser`/`loopback`/`device`/`checkout`), `created_at`, `last_used_at`, `expires_at` |
| `auth_requests` (m) | `id`, `kind` (`connect`/`device`/`checkout_handoff`), `project_id`, `code_hash`, `user_code`, `pkce_challenge`, `origin`, `redirect_uri`, `browser_nonce_hash`, `supporter_id?`, `attempts`, `expires_at`, `consumed_at` |
| `oauth_states` | `state_hash`, `flow` (`maintainer_login`/`maintainer_connect`/`supporter_connect`), `browser_nonce_hash`, `auth_request_id?`, `pkce_verifier_enc`, `expires_at` |
| `checkout_sessions` (m) | `id` (`cs_…`), `client_secret_hash`, `project_id`, `session_id?`, `supporter_id?`, `auth_request_id?`, `options jsonb`, `provider?`, `status`, `result jsonb?`, `origin`, `return_to`, `created_at`, `expires_at` (24 h) |
| `web_sessions` | `id`, `kind` (`maintainer`/`supporter`), `subject_id`, `token_hash`, `csrf_hash`, `expires_at` |

## 5. Supporter authentication

Sponsorkit acts as an **OAuth-style authorization server for its SDKs**. Provider OAuth happens only on the server. SDKs never see provider tokens or secrets.

The supporter's provider token is stored encrypted. It is what makes **on-demand** checks possible (§6.3).

### 5.1 Common rules

- **PKCE everywhere.** Every SDK flow uses PKCE (S256). Codes are single-use and expire after 60 s.
  - Each code is bound to (project, mode, origin or redirect_uri, PKCE challenge).
  - The binding is re-checked at `POST /api/v1/auth/token`.
- **Delivery targets are validated before any provider redirect.**
  - `mode=web_message`: `origin` must exactly match (scheme + host + port) an entry in `allowed_origins`. It is then used as the `postMessage` target origin, never `*`.
  - `mode=redirect`: `redirect_uri` must exactly match an entry in `redirect_uris`.
  - `mode=loopback`: only `http://127.0.0.1:{any port}/callback` or `http://[::1]:{any port}/callback` (RFC 8252 §7.3).
  - `pk_test_` keys may also use `http://localhost:*` origins.
  - If a project has no `allowed_origins`, `web_message` and `redirect` are disabled.
- **Supporter web session.** `/connect`, `/checkout` and `/account` share a first-party session.
  - Cookie: `__Host-sk_web`, HttpOnly, Secure, SameSite=Lax, 12 h.
  - Every state-changing call carries a CSRF token.
- **Provider OAuth `state`.**
  - Random, single-use, expires after 10 min.
  - Bound to the browser through a pre-auth cookie nonce.
  - Kept in a separate namespace per flow, each with its own callback path: `/api/oauth/{provider}/{maintainer-login|maintainer-connect|supporter}`.
  - Any mismatch is rejected.
- **Consent text**, shown on every sign-in: *"‹Project› will see your contributions to ‹maintainer›, and which of your linked accounts made them. Sponsorkit will check ‹provider› for you when the app asks."*

### 5.2 Flows

| Host | Flow |
|---|---|
| Browser app | `signIn()` must run from a click handler. It opens a popup **synchronously** at `sponsorkit.io/connect?pk=…&challenge=…&mode=web_message&origin=…`. The user goes through provider OAuth, then the page `postMessage`s a one-time code back and the SDK exchanges it. If the popup is blocked, the SDK falls back to `mode=redirect` when `redirect_uris` are configured. Otherwise it fails with `popup_blocked`. |
| CLI / desktop with a local browser | **Loopback.** The SDK listens on `127.0.0.1:{random}/callback` and opens the system browser. |
| Headless / SSH / container | **Device code** (RFC 8628). The SDK prints a `userCode` and `sponsorkit.io/device`, then polls `/api/v1/auth/token`, honoring `interval` and `slow_down`.<ul><li>`userCode`: 8 characters from a 20-letter alphabet (≈34 bits), expires in 10 min.</li><li>After 5 wrong tries per IP or per code, the code is invalidated.</li><li>`/device` shows the project, the client kind, and when the code was requested.</li><li>Device sessions expire after 30 days idle.</li></ul> |
| Auto-pick | Native SDKs use loopback. They fall back to device code when there is no display, when `SSH_CONNECTION` is set, or when the browser fails to open. |

### 5.3 Linking and merging

- **Linking.** In `/connect` or `/account`, a signed-in supporter can add another provider, and the new identity is attached. The page always shows "Signed in as GitHub @alice · Linked: Patreon".
- **Merging.** If the identity already belongs to another supporter:
  - Merging is offered **only in `/account`**, after a **fresh sign-in with both identities** within the last 5 minutes.
  - The confirmation screen shows both sides.
  - The merge can be undone from `/account` for 7 days.
  - `/connect` never merges.
- **Removing an identity** in `/account` revokes its provider token where the provider supports revocation.

### 5.4 SDK sessions

- **Token.** `sks_` plus 32 random bytes. Scoped to one supporter, one project and one mode.
- **Expiry.** 180 days, rolling. Device sessions: 30 days.
- **Revocation.** From `/account` or `signOut()`.
- **Headers.** `Authorization: Bearer sks_…` and `Sponsorkit-Key: pk_…`. Project and mode must match.

### 5.5 Provider OAuth

| Provider | Supporter scopes | Maintainer-connect | Token lifetime / notes |
|---|---|---|---|
| GitHub (one OAuth App, device flow enabled) | `read:user read:org` | No extra OAuth; uses the maintainer login (`read:user read:org`) | Tokens don't expire. Identity key is `databaseId`. *To verify:* does `read:user` return tier amounts? If not, request `user` (D6). |
| Open Collective | `orders incognito` | `account` (proves admin of the collective, reads its tiers and currency) | Tokens last 90 days with no refresh. On expiry the identity becomes `token_status=expired`: results are served from cache with `stale: true`, and `/account` and the SDK result prompt a reconnect. |
| Patreon (one v2 client) | `identity identity.memberships` | `campaigns` (campaign ID, currency, tiers) | Refresh tokens rotate, so the new one is stored on every refresh. Scopes and `fields[...]` are always listed explicitly. After a 401, Sponsorkit stops retrying until the user re-authenticates, to avoid Patreon's 4xx ban. |

## 6. Contribution data (on demand)

### 6.1 Result shape (JSON; the same in every SDK)

```jsonc
{
  "signedIn": true,
  "disabled": false,
  "supporter": {
    "id": "sup_p_…",                        // pairwise: differs per project (§6.4)
    "identities": [ { "provider": "github", "id": "583231", "handle": "alice", "needsReconnect": false } ]
  },
  "contributions": [
    {
      "id": "con_github_…",                 // stable, derived from provider + external id
      "provider": "github",                 // github | opencollective | patreon | test
      "sponsor": { "type": "user", "provider": "github", "id": "583231", "handle": "alice" },
      "via": "direct",                      // direct | organization
      "kind": "recurring",                  // recurring | one_time
      "frequency": "monthly",               // one_time | monthly | yearly
      "status": "active",                   // §6.2
      "amount": { "value": 500, "currency": "USD" },  // minor units
      "tier": { "id": "ST_…", "name": "Coffee" },     // nullable
      "flags": [],                          // trial | gifted | via_patreon
      "startedAt": "2026-03-01T10:00:00Z",
      "endedAt": null,
      "lastChargedAt": null,                // null where the provider doesn't expose it
      "nextChargeAt": null,
      "totalContributed": null,             // { value, currency } where available
      "payments": []                        // where available (6.3)
    }
  ],
  "fetchedAt": "2026-11-16T18:00:00Z",      // oldest provider answer included
  "stale": false,                           // some provider couldn't be refreshed
  "fromCache": false                        // served from the SDK's local cache
}
```

When the user is signed out or Sponsorkit is disabled, the result has `signedIn: false` (or `disabled: true`), `supporter: null` and `contributions: []`.

### 6.2 Status values & mapping

**Status values:**

- `active`
- `paused`
- `past_due`
- `cancelled`
- `paid` (a completed one-time payment)
- `refunded`
- `disputed`
- `failed`
- `pending`

`active()` returns `active` contributions. Unknown provider values map to `pending` and are logged.

**GitHub**

| Provider data | Status |
|---|---|
| `isOneTimePayment=true` | `paid` |
| Recurring and `isActive=true` | `active` |
| Recurring and `isActive=false` | `cancelled` |
| `paymentSource=PATREON` | adds the `via_patreon` flag |

GitHub only reports a pending cancellation through webhooks, so it shows as `active` until the sponsorship actually ends.

**Open Collective**

| Provider status | Status |
|---|---|
| `ACTIVE` | `active` |
| `PAID` | `paid` |
| `PAUSED` | `paused` |
| `CANCELLED`, `EXPIRED` | `cancelled` |
| `REFUNDED` | `refunded` |
| `DISPUTED` | `disputed` |
| `ERROR`, `REJECTED` | `failed` |
| `NEW`, `PENDING`, `PROCESSING`, `REQUIRE_CLIENT_CONFIRMATION`, `IN_REVIEW` | `pending` |

Status always comes from the order, never from membership.

**Patreon**

| Provider data | Status |
|---|---|
| `active_patron` | `active`, plus the `trial` or `gifted` flag where it applies |
| `declined_patron` | `past_due` |
| `former_patron` | `cancelled` |
| `null`, or an entitled amount of 0 | not a contribution |

### 6.3 How data is fetched

`GET /api/v1/me/contributions` does the following:

1. For each (linked identity × project connection of the same provider):
   - If a `contribution_cache` row is younger than the requested `freshness` (default 1 h, minimum 60 s, maximum 24 h), it is used as is.
   - Otherwise the provider is queried **live with the supporter's token** (table below) and the cache row is replaced.
2. If a provider call fails or the token has expired, the last cached row is served and the result is marked `stale: true`. A provider failure never surfaces as an API error.
3. Independent provider calls run in parallel.

| Provider | Live query (supporter side) | `payments` |
|---|---|---|
| GitHub | One GraphQL request: `viewer { sponsorshipsAsSponsor(activeOnly:false, maintainerLogins:[…]) }` plus aliased `organization(login){ sponsorshipsAsSponsor(maintainerLogins:[…]) }` for the viewer's orgs (`viewer.organizations`, cached for 24 h). | None. GitHub exposes no charges. Currency is USD. |
| Open Collective | `me { orders(filter:OUTGOING, oppositeAccount:{slug}, includeIncognito:true) }`, plus the same for collectives the user administers (`memberOf(role:ADMIN)`). | None in v1. `totalContributed`, `lastChargedAt` and `nextChargeAt` come from the order. |
| Patreon | `GET /api/oauth2/v2/identity?include=memberships&fields[member]=patron_status,currently_entitled_amount_cents,will_pay_amount_cents,campaign_lifetime_support_cents,pledge_cadence,last_charge_date,last_charge_status,next_charge_date,pledge_relationship_start,is_free_trial,is_gifted`. Memberships are matched on `relationships.campaign.data.id`. Memberships to other campaigns are discarded in memory. | None in v1. `totalContributed` is in the campaign currency. |
| Test | Reads the simulated data set (§10.3). | Simulated |

Rate limits are per token: Patreon allows 100 requests/min and Open Collective 100 requests/min per token, and GitHub allows 5,000 requests/hour. Because limits are per token and Sponsorkit refreshes at most once per identity per minute, normal use stays far below them. A shared token bucket per provider also protects the app-wide quota (Patreon: 100 requests per 2 s per client).

### 6.4 Privacy

- **Visibility in maintainer-facing views.** A contribution is shown as "Private supporter" (amount, frequency and status only, no identity) when:
  - the supporter set `visibility=private`, or
  - the provider marks it private: a GitHub `PRIVATE` sponsorship, an Open Collective incognito order, or a masked Patreon identity.
- **Pairwise supporter IDs.** Each project sees `sup_p_` + base32(HMAC(server_key, project_id ‖ supporter_id)), so unrelated projects can't correlate users.
- **Minimal identity disclosure.**
  - `supporter.identities` lists only the identity used for this session and identities that have contributions to this project.
- **The supporter's own data.** The SDK always returns the signed-in supporter's own contributions to that project. The supporter consented at sign-in.

### 6.5 Organization sponsorships

- Contributions from a GitHub org, or from an Open Collective collective or organization that the user belongs to (or administers, for Open Collective), are **always returned** to that user.
- They are marked `via: "organization"` and `sponsor.type: "organization"` (D5). The developer decides whether they count; `fc.direct()` filters them out.
- Private org sponsorships may only be visible to org admins.

### 6.6 Maintainer dashboard: supporters

The supporter list is also fetched **on demand** when the maintainer opens it, using the stored maintainer connection tokens. It is cached for 10 minutes and paginated across requests to stay within the subrequest budget.

| Provider | Source |
|---|---|
| GitHub | `sponsorshipsAsMaintainer(includePrivate:true, activeOnly:false)` |
| Open Collective | `account.orders(filter:INCOMING)` |
| Patreon | campaign members |

Two rules apply to the list:

- The privacy rules in §6.4 apply.
- Rows for people who have signed in to the project through Sponsorkit are marked "Uses your app".

## 7. HTTP API (`https://sponsorkit.io/api/v1`)

- Requests and responses are JSON, camelCase.
- Errors use `application/problem+json` with a stable `code`: `invalid_public_key`, `invalid_secret_key`, `mode_mismatch`, `session_revoked`, `rate_limited`, `invalid_request`, `not_found`.
- Every response carries a `Sponsorkit-Request-Id` header. `429` responses include `Retry-After`.

### 7.1 Client API (`Sponsorkit-Key: pk_…`; session bearer where noted)

**Sign-in**

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /auth/token` | pk | Exchanges `{code, codeVerifier}` or `{deviceCode}` for `{sessionToken, expiresAt, result}` |
| `POST /auth/device` | pk | Returns `{deviceCode, userCode, verificationUri, verificationUriComplete, interval, expiresIn}` |

**Contributions and session**

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /me/contributions?freshness=3600` | pk + session | The §6.1 result |
| `DELETE /me/session` | pk + session | Sign out |

**Checkout**

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /projects/{pk}/checkout` | pk | Public config. For each enabled provider: `currency`, `frequencies`, `tiers`, `customAmount`, `minAmount`. Also the presets and default currency. |
| `POST /checkout/sessions` | pk (+ optional session) | Creates a checkout session. Body: `{amount?, currency?, frequency?, allowedFrequencies?, allowCustomAmount?, providers?, lockAmount?, origin?, returnTo?, codeChallenge?}`. Returns `{id, clientSecret, url, expiresAt}`. Values are clamped to the project config. `returnTo` and `origin` must be in `allowed_origins`. `codeChallenge` is required when there is no session. |
| `GET /checkout/sessions/{id}` | pk + `Sponsorkit-Checkout-Secret` | Returns `{status, provider?, contribution?, code?}`. `status` is `open`, `returned`, `abandoned` or `expired`. |

CORS: any origin is allowed, without credentials. This is safe because every request is authenticated by key or bearer token.

### 7.2 Hosted pages

| Path | Purpose |
|---|---|
| `/connect` | Sign-in and linking |
| `/device` | Enter a device code |
| `/checkout?id=cs_…` | Checkout for an SDK-created session |
| `/c?pk=…&amount=&currency=&frequency=` | Stable checkout link that never expires. It is always anonymous and creates its session lazily. Used by `checkoutUrl()` and README badges. |
| `/account` | Linked identities, merge, visibility, active sessions, reconnect expired providers. Cancelling a contribution happens on the provider, and `/account` links there. |

### 7.3 Server API (`Authorization: Bearer sk_…`)

- No CORS.
- Requests that carry an `Origin` header are rejected.
- Rate-limited per key.

| Method & path | Purpose |
|---|---|
| `POST /sessions/introspect` | `{sessionToken, freshness?}` returns `{active, result}`. `active` is false unless the session belongs to this key's project and mode. |
| `GET /supporters/{pairwiseId}/contributions?freshness=` | Same shape as above. Returns 404 unless the supporter has a session with this project. |

Lookup by provider identity without a session is **not in v1**. It would need maintainer-side scans; see §12.

### 7.4 Web API (`/api/web/*`)

These endpoints back the dashboard and `/account`. They authenticate with a same-origin `__Host-` cookie and a CSRF token, and are not a public contract.

| Area | Operations |
|---|---|
| Maintainer | GitHub login |
| Projects | CRUD; origins; redirect URIs; checkout config |
| Keys | Secret keys; rotating public keys |
| Connections | Connect and disconnect, with health shown (token valid, tiers loaded) |
| Supporters | The list (§6.6) and CSV export |
| Test provider | Simulation |
| Supporters (`/account`) | Every account operation |

## 8. Checkout

### 8.1 Hosted flow

**Opening the checkout**

- **Browser:** `openCheckout(opts)` opens the popup **synchronously** inside the click handler, at `sponsorkit.io/checkout?new=1&pk=…&opts=…&origin=…`. The page creates the session. If the popup is blocked, the SDK redirects when `returnTo` is set, and otherwise fails with `popup_blocked`.
- **Native:** `POST /checkout/sessions`, then open the system browser.

**Steps on the page**

1. **Amount.**
   - Presets, plus a custom amount if the project allows it.
   - `lockAmount` fixes the amount.
   - Amounts below the minimum are raised to it.
2. **Frequency.** `one_time | monthly | yearly`, limited to `allowedFrequencies`.
3. **Provider.** Only providers that can satisfy the choice are enabled, and each disabled one shows why:
   - **Currency:** must match exactly; there is no conversion.
     - GitHub: USD.
     - Open Collective, Patreon: the connection's currency.
   - **Frequency:**
     - GitHub: monthly or one-time.
     - Patreon: monthly.
     - Open Collective: all.
   - **Tiers (GitHub, Patreon):**
     - Pick the cheapest tier at or above the amount.
     - If there is none, pick the highest tier.
     - If the provider has no tiers, it is disabled.
4. **Identify.**
   - The supporter signs in with the chosen provider, so the contribution can be found afterwards.
   - If the checkout came from a signed-in SDK session, the person in the browser must prove an identity **already linked** to that supporter, or choose "continue as someone else". The URL alone never grants linking.
5. **Pay.** The supporter is redirected to the provider and pays there:
   - **Open Collective:** redirect to `opencollective.com/{slug}/donate?amount=…&interval=…&redirect=…`.
   - **GitHub:** redirect to the chosen tier on `github.com/sponsors/{login}`.
   - **Patreon:** redirect to the tier's `url`, falling back to the campaign URL.
   - *To verify during the build:* GitHub's tier and frequency URL parameters, and whether anything gets appended to return URLs.
6. **Return.**
   - **Back from the provider:** the session is marked `returned`, and the supporter's contributions are refreshed with `freshness=0`. A new contribution can take a few minutes to appear at the provider. The SDK may call `getFinancialContribution({ freshness: 60 })` again later.
   - **Signed-out checkouts:** the page issues a one-time handoff code bound to the SDK's `codeChallenge`. The SDK gets it via `postMessage`, the loopback callback, or the `code` field in the status call, and exchanges it. The supporter ends up **signed in** after paying.
   - **What `openCheckout()` resolves with:** `{status: "returned" | "cancelled", contribution?, signedIn}`.
     - Browser: polls after a `postMessage` or when the popup closes.
     - Native: polls every 3 s until a terminal status, a timeout or cancellation (`AbortSignal`, `CancellationToken`, `context.Context`, …), or `expiresAt`.
     - If the popup closes, or the timeout is hit, while the session is still `open`, the result is `cancelled`.
   - **Unfinished sessions:** after 2 hours a session is shown as `abandoned`. After 24 hours it is `expired`.

### 8.2 Project checkout config

- Enabled providers and their order.
- Default currency.
- Preset amounts and minimum amount.
- Whether custom amounts are allowed.
- Allowed frequencies.
- Thank-you message.
- Return URL, which must be listed in `allowed_origins`.

## 9. SDKs

### 9.1 Client API (TypeScript shown; other languages use idiomatic names, see §9.6)

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({
  publicKey: "pk_live_…",
  cacheTtl: 3600,        // seconds the SDK serves its local cache without calling the API
  freshness: 3600,       // max age of provider data the API may return (min 60s)
  storage: undefined,    // default: localStorage (browser) / per-user config dir (native)
  apiBaseUrl: undefined, // override for tests / self-hosting
});

await sk.signIn();                         // from a click handler in browsers
await sk.signIn({ provider: "github" });
sk.isSignedIn();                           // local check

const fc = await sk.getFinancialContribution();       // never throws for network/server issues
const fresh = await sk.getFinancialContribution({ cacheTtl: 0, freshness: 60 });

const r = await sk.openCheckout({
  amount: 500, currency: "USD",
  frequency: "monthly", allowedFrequencies: ["monthly"],
  allowCustomAmount: true, signal,
}); // { status: "returned" | "cancelled", contribution?, signedIn }

sk.checkoutUrl({ frequency: "monthly", amount: 500 }); // sync, offline-safe link to /c
sk.accountUrl();
await sk.signOut();                                    // revokes; clears token + cache
```

**Helpers.** These only filter; they never sum across providers or currencies.

- `fc.active()`
- `fc.recurring()`
- `fc.oneTime()`
- `fc.byProvider(p)`
- `fc.direct()`

```ts
const supporting = fc.active().some(c =>
  c.frequency === "monthly" && c.amount.currency === "USD" && c.amount.value >= 500);
if (fc.signedIn && !supporting) showAd();
```

### 9.2 Error contract (identical in every SDK; enforced by the conformance suite)

| Situation | Behaviour |
|---|---|
| Invalid or revoked public key, or `mode_mismatch` | **Throws** `SponsorkitError{code}`. This is a developer error. |
| Not signed in | Returns the signed-out result. No network call. |
| `session_revoked` or session expired | Clears the token and cache, then returns the signed-out result. |
| Network error, 5xx, or `rate_limited` | Returns the cache (`fromCache:true, stale:true`). If nothing is cached, returns a signed-in empty result with `stale:true`. Honours `Retry-After`. **Never throws.** |
| `SPONSORKIT_DISABLE=1` | No network or disk access. Returns `disabled:true`. `nag.due()` returns false. `signIn` and `openCheckout` reject with `disabled`. |
| Popup blocked | `signIn` and `openCheckout` reject with `popup_blocked`, unless the redirect fallback applies. |

### 9.3 Nag helper

```ts
const nag = sk.nag({ id: "my-cli", every: 10, orEvery: "P7D" });
if (await nag.due(fc => fc.active().length === 0)) {
  console.error(`❤️ Enjoying my-cli? Support it: ${sk.checkoutUrl({ frequency: "monthly" })}`);
  nag.shown();
}
```

- **Run counter.** Incremented once per process per `id`, on the first `due()` call. Stored next to the cache, keyed by `(pk, id)`.
- **When `due()` returns true.** When `predicate(result) && (runs >= every || now - lastShown >= orEvery)`. Calling `shown()` resets both the counter and `lastShown`.
- **Duration format.** ISO-8601 (`P7D`), or the language's native duration type.
- **When `due()` always returns false.**
  - `SPONSORKIT_DISABLE`, `SPONSORKIT_NO_NAG` or `CI` is set.
  - stdout or stderr is not a TTY.
  - `{force:true}` overrides both. Libraries should not pass it.
- **No implicit sign-in.** `signIn()` is never called implicitly.

### 9.4 Local storage

- **Where:**
  - Browsers: `localStorage`.
  - Linux: `$XDG_CONFIG_HOME/sponsorkit`.
  - macOS: `~/Library/Application Support/sponsorkit`.
  - Windows: `%APPDATA%\sponsorkit`.
  - Directories are created with mode `0700` and files with `0600` (a user-only ACL on Windows).
- **What:** the token is stored per public key. The cache is keyed by `(pk, pairwise supporter id)`.
- **Writes** are atomic: write a temp file, then rename it.
- **OS keychain** storage for the token is available as an opt-in.
- **Clearing:** `signOut()` and `session_revoked` clear both the token and the cache.

### 9.5 Web components & server entry point

- **`@sponsorkit/sdk/elements`**
  - `<sponsorkit-button public-key amount frequency>` opens the checkout synchronously.
  - `<sponsorkit-badge>` shows "Supporter ♥" when `active()` is non-empty.
- **`@sponsorkit/sdk/server`** (with an equivalent in every language)
  - `new SponsorkitServer({ secretKey })`
  - `introspect(sessionToken)`
  - `getContributions(pairwiseSupporterId)`

### 9.6 Per-language surface

| | JS/TS | .NET | Python | Go | Rust |
|---|---|---|---|---|---|
| Package | `@sponsorkit/sdk` | `Sponsorkit` | `sponsorkit` | `github.com/sponsorkit/sponsorkit.io/sdks/go` | `sponsorkit` |
| Get | `getFinancialContribution()` | `GetFinancialContributionAsync(ct)` | `get_financial_contribution()` / `aget_…` | `GetFinancialContribution(ctx)` | `get_financial_contribution().await` |
| Sign in | popup, redirect, loopback, device | loopback, device | loopback, device | loopback, device | loopback, device |
| Checkout | popup / system browser | system browser | system browser | system browser | system browser |
| UI elements | ✅ | – | – | – | – |
| Nag, cache, error contract | ✅ | ✅ | ✅ | ✅ | ✅ |
| Server client | ✅ | ✅ | ✅ | ✅ | ✅ |
| Runtime floor | Node 20+, Bun, Deno, evergreen browsers | netstandard2.0 / net8.0 | 3.10+ | Go 1.23+ | MSRV 1.85 |
| Runtime deps | none | System.Text.Json (netstandard only) | `httpx` | stdlib | `reqwest` (rustls), `serde`, `tokio` |

### 9.7 Conformance suite

`sdks/conformance/` holds a fake API and fixtures. Every SDK runs these scenarios in CI:

**Sign-in and session**

- signed out
- device sign-in
- loopback sign-in
- session revoked
- invalid key throws
- mode mismatch
- disabled

**Cache and network**

- cache hit
- offline with cache
- offline without cache
- rate-limited with `Retry-After`

**Checkout**

- checkout returned while signed in
- checkout returned while signed out (handoff)
- checkout cancelled or timed out

**Nag and storage**

- nag counting
- file permissions
- concurrent writes

## 10. Operations

### 10.1 Rate limits (starting values)

| Endpoint | Limit |
|---|---|
| `/auth/*` | 30/min per IP |
| Device code entry | 5 tries per code |
| `/me/contributions` | 60/min per session (provider refresh at most 1/min per identity) |
| `/checkout/sessions` | 20/min per IP |
| Server API | 600/min per key |

### 10.2 Observability

- **Logs:** Workers Logs (free tier), structured JSON.
- **Dashboard:** per-connection health shows token validity, and the last successful provider call.
- **Supporter identities** carry a `token_status`, which `/account` surfaces as "Reconnect Open Collective".

### 10.3 Test mode

- `pk_test_` and `sk_test_` keys only see test-mode data.
- **Open Collective** uses its staging environment when staging credentials are configured.
- **GitHub and Patreon** have no sandboxes. For those, there is a built-in **Test provider**:
  - In the dashboard, maintainers create simulated supporters and contributions with any status, amount, frequency or organization.
  - `/connect` offers "Sign in as test supporter".
  - The conformance suite and e2e tests use the Test provider.

### 10.4 Deploy

- **API and site.** A GitHub Actions job runs `wrangler deploy` for the Worker and its static assets, followed by Drizzle migrations against Neon's direct endpoint.
- **Preview deployments** use Workers versions and a Neon branch.

## 11. Delivery plan (after approval)

All of this lands in this PR as reviewable commits.

1. **Foundation**
   - Bun workspaces, the Worker with Hono, Drizzle schema and migrations, Zod schemas, OpenAPI generation.
   - Maintainer GitHub login, projects, keys, modes, rate limiting.
   - Vitest with Postgres.
2. **Supporter auth**
   - Web session, connect, popup, redirect, loopback, device.
   - Linking and merging, SDK sessions, pairwise IDs.
3. **Providers**
   - Test provider, then GitHub, Open Collective and Patreon.
   - Each provider gets: maintainer connect, live supporter query, normalization, a dashboard list, and an MSW test suite built from the documented responses.
4. **Checkout**
   - The hosted flow, provider eligibility, handoff codes.
5. **Web**
   - Landing page, docs, dashboard, hosted pages.
   - Playwright e2e tests against the Test provider.
6. **SDKs**
   - JS/TS first, as the reference.
   - Then .NET, Python, Go and Rust, plus the conformance suite.
7. **CI/CD**
   - Tests per component and Worker deploy.
   - Trusted publishing to npm, NuGet, PyPI and crates.io; Go tags `sdks/go/vX.Y.Z`.

**Definition of done**

- Everything builds and all tests pass.
- Going live needs only the credentials in §14.
- Items under §12's "To verify during the build" are checked, or listed in the PR as unverified.

## 12. Trade-offs of on-demand, and things to verify

### Accepted trade-offs

- **Freshness follows the cache.** A cancellation shows up within `freshness` (default 1 h) the next time the app asks.
- **GitHub pending cancellations** can't be seen without webhooks, so they stay `active` until they end.
- **Open Collective sign-ins expire after 90 days.** The supporter reconnects once per quarter. Until then the SDK result carries `stale: true` and `needsReconnect`.
- **No lookups without a session.** Sponsorkit only knows supporters who signed in. A server-side "look up GitHub user X" is deferred: it would need maintainer-side scans.
- **The first call after the cache expires is slower** (one provider round-trip, ~0.3–1 s). The SDK's local cache hides this on later calls.

### To verify during the build

- **GitHub:** which scope returns tier amounts and private sponsorships, and the checkout URL parameters.
- **Open Collective:** whether `includeIncognito` works with a user token.
- **Patreon:** the currency of `currently_entitled_amount_cents`, and the tier `url` as a checkout link.
- **Cloudflare:** whether the Rate Limiting binding is available on the free plan.

## 13. Decisions

| # | Decision | Outcome |
|---|---|---|
| **D1** | Stripe processing fees | ✅ **Moot.** Stripe Connect was removed as a provider (D8). |
| **D2** | Hosting | ✅ **Cloudflare Workers, free plan.** A single Worker serves the TypeScript API and the static site. Moving to Workers Paid ($5/mo) is a plan change only. |
| **D3** | Patreon consent scope `identity.memberships` | Proposed: accept it. Memberships to other campaigns are never stored. |
| **D4** | Package names: `@sponsorkit`, `Sponsorkit`, `sponsorkit` | Proposed: reserve them now. Fall back to `sponsorkit-sdk` where a name is taken. |
| **D5** | Org sponsorships | ✅ **Always included**, marked `via: "organization"`. |
| **D6** | GitHub `user` scope if `read:user` doesn't return amounts | Proposed: use it only if verification requires it, and disclose it. |
| **D7** | Webhooks | ✅ **None.** Data is fetched on demand from providers with the supporter's token. Nothing is sent to maintainers. |
| **D8** | Stripe Connect as a direct provider | ✅ **Removed.** Sponsorkit never processes payments. Supporters pay on GitHub Sponsors, Open Collective or Patreon. Providers such as Polar or Ko-fi can be added later through the same adapter interface. |

## 14. What you will need to provide to go live

1. **GitHub OAuth App** (with device flow enabled): client ID and secret.
2. **Open Collective OAuth app**, plus optionally a staging app: client ID and secret.
3. **Patreon v2 client:** client ID and secret.
4. **Cloudflare account** (free).
   - DNS for `sponsorkit.io` on Cloudflare.
   - An API token for GitHub Actions deploys.
5. **Neon project:** the pooled connection string, and the direct connection string for migrations.
6. **Package registry trusted publishers** for npm, NuGet, PyPI and crates.io, once the names are reserved (D4).
