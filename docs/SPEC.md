# Sponsorkit: product & technical specification

> Status: **DRAFT v3, awaiting approval.** Decisions D1, D2 and D5 are settled. Nothing below is built yet.
> Last updated: 2026-11-16. v2 includes fixes from an independent review covering provider correctness, security, and developer experience.

## 1. What Sponsorkit is

Sponsorkit lets an open source maintainer build financial contributions directly into their software.

A maintainer installs a Sponsorkit SDK in their project. SDKs are published to npm, NuGet, PyPI, Go modules and crates.io. With an SDK the maintainer can:

1. **Ask what the current user has contributed** with `getFinancialContribution()`.
2. **Let the user start contributing** with `openCheckout({ amount, frequency, … })`, which opens a checkout hosted by Sponsorkit.
3. **Decide what to do with that information.** Examples: show an ad if the user gives less than $5/month, show a "consider sponsoring" nag every N runs, or unlock a feature. Sponsorkit reports facts; the maintainer writes the rules.

Contributions come from **payment providers**. v1 supports:

| Provider | Recurring (Sponsorkit can preset) | One-time | Custom amount at checkout | Currency | Supporter identity |
|---|---|---|---|---|---|
| GitHub Sponsors | monthly | ✅ | Tier-based (custom-amount tiers if the maintainer enabled them) | USD only | GitHub account |
| Open Collective | monthly, yearly | ✅ | ✅ (`?amount=&interval=`) | The collective's currency | Open Collective account |
| Patreon | monthly (the patron can switch to annual on Patreon) | ❌ (Patreon has none) | Tier-based | The campaign's currency (tiers priced in USD) | Patreon account |
| Stripe (Sponsorkit Connect) | monthly, yearly | ✅ | ✅ | Any Stripe-supported currency | Verified email (magic link) |

### 1.1 Non-goals (v1)

- **No aggregation and no currency conversion.** Contributions are returned **per provider as raw history**. Sponsorkit never decides whether someone "counts" as a supporter.
- **No tamper-proofing of client-side checks.** The software is open source, so anyone can patch out a check. Server-side verification with a secret key exists for SaaS backends that need a trustworthy answer.
- **No platform fee.** Sponsorkit is free. See decision D1 (§13) for Stripe processing fees.
- **No Bountyhunt.** Removed entirely.

## 2. Actors & vocabulary

| Term | Meaning |
|---|---|
| **Maintainer** | Builds the OSS software. Signs in to `sponsorkit.io` with **GitHub only**. |
| **Project** | One piece of software that integrates Sponsorkit. Owned by a maintainer. Has a **live** and a **test** public key (`pk_live_…`, `pk_test_…`) and any number of secret keys (`sk_live_…`, `sk_test_…`). |
| **Mode** | `live` or `test`. Every key, session, connection, contribution, checkout and event belongs to exactly one mode. Modes never mix (§10.4). |
| **Provider connection** | A maintainer's receiving account at a provider: a GitHub Sponsors listing (user or org), an Open Collective collective, a Patreon campaign, a Stripe connected account, or the built-in **Test provider** (test mode only). A project picks which of its maintainer's connections count for it. |
| **Supporter** | An end-user of the software. One Sponsorkit person with one or more **linked identities** (GitHub, Open Collective, Patreon, email). |
| **Session** | A supporter signed in to one project, in one mode, from one app instance. The SDK holds an opaque **session token** (`sks_…`). |
| **Contribution** | One sponsorship, order, membership or subscription from a **sponsor entity** to a provider connection, normalized, with whatever payment history the provider exposes. |
| **Sponsor entity** | Who actually pays: a user, or an organization or collective. A contribution reaches a supporter either **directly** (the supporter's own identity paid) or **via an organization** the supporter belongs to (§6.5). |

## 3. Architecture

```
                 ┌──────────────────────── sponsorkit.io (Next.js 16) ──────────────────────────┐
 Supporter ────▶ │ /connect  /device  /checkout/…  /c/{pk}  /account  /docs  /dashboard  /api/* │ ◀── Maintainer
 (browser)       └────────────────────────────────┬─────────────────────────────────────────────┘
                                                  │ server-side proxy (dashboard + supporter web session)
 SDK in app ───── HTTPS (bearer) ───────────────▶ ▼
 (pk_ + sks_)          ┌──────── api.sponsorkit.io (ASP.NET Core, .NET 10, Cloud Run) ─────────┐
 SaaS backend ───────▶ │  /v1 public API   /web (internal, for Next only)   /webhooks/{provider} │
 (sk_)                 └───┬──────────────┬─────────────────────┬────────────────────┬──────────┘
                           │              │                     │                    │
                    Neon Postgres   GitHub / OC / Patreon     Stripe (Connect)   "tick" service (Cloud Run,
                    (pooled)        GraphQL / REST            platform account    IAM-only) ◀── Cloud Scheduler
```

- **API**
  - ASP.NET Core minimal APIs on **.NET 10 LTS**, EF Core 10 with Npgsql.
  - Runs on **Google Cloud Run**: min instances 0, startup CPU boost, ReadyToRun plus precompiled EF queries. No Native AOT, because EF Core AOT is still experimental.
- **Background work**
  - Cloud Run throttles CPU after a response is sent, so nothing runs in-process in the background.
  - The same container image is also deployed as a second Cloud Run service, **`sponsorkit-tick`**. It requires IAM authentication and is invoked by Cloud Scheduler every minute. That means 2 scheduler jobs, within the free tier of 3.
  - A tick does the following:
    - drains the outbox (outbound webhooks) and retries failed deliveries;
    - runs incremental provider syncs (§6.3);
    - re-activates paused Patreon webhooks;
    - expires codes, sessions and checkouts.
  - The tick service also checks the OIDC token in code: issuer, audience and service-account email.
- **Database**
  - **Neon Postgres, free tier.**
  - The app uses the pooled (`-pooler`) endpoint with a small pool, `SSL Mode=Require` and EF retry-on-failure. The retries absorb Neon's 5-minute idle resume.
  - Migrations use the direct endpoint.
  - The pooled endpoint does not support session state, `LISTEN` or advisory locks. The app relies on none of them.
- **Web**
  - Next.js 16 (App Router, TypeScript). It serves the marketing site, docs, maintainer dashboard and the hosted supporter pages.
  - Browser traffic for the dashboard and supporter pages goes to **Next's own `/api/*` route handlers**, which proxy server-to-server to the API's internal `/web` surface. All cookies are therefore **host-only `__Host-` cookies on `sponsorkit.io`**, never `.sponsorkit.io`.
  - Hosted on **Cloudflare Workers** via OpenNext (D2).
- **Secrets**
  - Provider tokens are encrypted with AES-256-GCM. Each ciphertext stores a `key_version`, and the row ID is used as associated data (AAD).
  - Keys live in Google Secret Manager. Several keys can be active at once for rotation.
  - Secret keys, session tokens, codes and webhook URL tokens are stored only as SHA-256 hashes plus a short display prefix, and compared in constant time.

### 3.1 Repository layout (monorepo)

```
api/                     .NET solution
  src/Sponsorkit.Api/          HTTP endpoints, auth, inbound webhooks, tick handlers
  src/Sponsorkit.Core/         domain, EF Core, provider adapters, outbound webhook sender
  tests/Sponsorkit.Tests/      xUnit + Testcontainers Postgres + WireMock.Net provider fakes
web/                     Next.js 16 site + dashboard + hosted pages (+ Playwright e2e)
sdks/
  js/                    @sponsorkit/sdk  (entry points: default, /node, /server, /elements)
  dotnet/                Sponsorkit (NuGet; netstandard2.0 + net8.0)
  python/                sponsorkit (PyPI; 3.10+)
  go/                    module github.com/sponsorkit/sponsorkit.io/sdks/go
  rust/                  sponsorkit (crates.io; edition 2024)
  conformance/           shared fake server + JSON fixtures + scenarios every SDK must pass
openapi/sponsorkit.v1.yaml     generated from the API, committed, diffed in CI
docs/                    this spec + ADRs
.github/workflows/       per-component CI + trusted publishing
```

## 4. Data model (Postgres)

Every row marked **(m)** has a `mode` column (`live`/`test`), and every query filters on it.

| Table | Key columns |
|---|---|
| `maintainers` | `id`, `github_user_id` (unique, immutable), `github_login`, `email` |
| `projects` | `id`, `maintainer_id`, `slug` (unique), `name`, `icon_url`, `public_key_live`, `public_key_test`, `allowed_origins text[]`, `redirect_uris text[]`, `checkout_config jsonb` |
| `secret_keys` (m) | `id`, `project_id`, `prefix`, `hash`, `name`, `last_used_at`, `revoked_at` |
| `provider_connections` (m) | `id`, `maintainer_id`, `provider`, `external_account_id`, `handle`, `currency`, `tiers jsonb` (id, name, amount, currency, frequency, url), `access_token_enc`, `refresh_token_enc`, `expires_at`, `webhook_secret_enc`, `webhook_token_hash`, `webhook_status`, `last_full_sync_at`, `last_incremental_sync_at`, `metadata jsonb` |
| `project_connections` | `project_id`, `connection_id` |
| `supporters` | `id`, `visibility` (`public`/`private`, default `public`) |
| `supporter_identities` | `id`, `supporter_id`, `provider` (`github`/`opencollective`/`patreon`/`email`/`test`), `external_user_id` (immutable ID; for email, the normalized address), `handle`, `email`, `access_token_enc`, `refresh_token_enc`, `expires_at`, `token_status`; **unique(provider, external_user_id)** |
| `identity_memberships` | `identity_id`, `provider`, `org_external_id`, `org_handle`, `role` (`member`/`admin`), `seen_at`. Records which orgs or collectives the identity belongs to (§6.5). |
| `sessions` (m) | `id`, `supporter_id`, `project_id`, `token_hash`, `client_kind` (`browser`/`loopback`/`device`/`checkout`), `created_at`, `last_used_at`, `expires_at` |
| `auth_requests` (m) | `id`, `kind` (`connect`/`device`/`magic_link`/`checkout_handoff`), `project_id`, `code_hash`, `user_code`, `pkce_challenge`, `origin`, `redirect_uri`, `browser_nonce_hash`, `supporter_id?`, `attempts`, `expires_at`, `consumed_at` |
| `oauth_states` | `state_hash`, `flow` (`maintainer_login`/`maintainer_connect`/`supporter_connect`), `browser_nonce_hash`, `auth_request_id?`, `pkce_verifier_enc`, `expires_at` |
| `checkout_sessions` (m) | `id` (`cs_…`), `client_secret_hash`, `project_id`, `session_id?`, `supporter_id?`, `auth_request_id?` (handoff), `options jsonb`, `provider?`, `status`, `stripe_checkout_session_id?`, `contribution_id?`, `origin`, `return_to`, `created_at`, `expires_at` (24 h), `completed_at` |
| `contributions` (m) | `id`, `connection_id`, `provider`, `external_id`, `sponsor_type` (`user`/`organization`), `sponsor_external_id`, `sponsor_handle`, `supporter_id?` (for direct contributions), `kind` (`recurring`/`one_time`), `status`, `amount_minor`, `amount_currency`, `frequency` (`one_time`/`monthly`/`yearly`), `tier_id`, `tier_name`, `flags text[]` (`trial`, `gifted`, `via_patreon`, `fee_covered`), `started_at`, `ended_at`, `last_charged_at`, `next_charge_at`, `total_minor`, `total_currency`, `is_private`, `raw jsonb`, `synced_at`; **unique(provider, external_id)** |
| `contribution_payments` (m) | `id`, `contribution_id`, `external_id`, `amount_minor`, `currency`, `status`, `charged_at` |
| `stripe_customers` (m) | `supporter_id`, `connection_id`, `customer_id` |
| `webhook_endpoints` (m) | `id`, `project_id`, `url`, `secret_enc`, `events text[]`, `enabled`, `failing_since` |
| `events` (m) | `id`, `project_id`, `type`, `payload jsonb`, `created_at` (outbox) |
| `webhook_deliveries` | `id`, `endpoint_id`, `event_id`, `attempt`, `status`, `response_code`, `next_attempt_at` |
| `inbound_events` | `provider`, `event_key`, `received_at`; **unique(provider, event_key)**. Used to deduplicate provider webhooks. |
| `rate_limit_buckets` | `key`, `tokens`, `updated_at` |

- A contribution belongs to a **connection**, not to a project. A project sees every contribution on the connections linked to it.
- `supporter_id` on a direct contribution is set as soon as the sponsor identity links to a supporter. This also covers contributions that were synced before the supporter ever signed in.

## 5. Supporter authentication

Sponsorkit acts as an **OAuth-style authorization server for its SDKs**. Provider OAuth happens only on the server; SDKs never see provider tokens or secrets.

### 5.1 Common rules

- Every SDK flow uses **PKCE (S256)**. Codes are single-use, expire after 60 s, are bound to `(project, mode, origin or redirect_uri, pkce_challenge)`, and are re-checked at `POST /v1/auth/token`.
- **Delivery targets.** The SDK always sends where the result should go, and the server validates it before any provider redirect:
  - `mode=web_message`: the SDK sends `origin`. It must exactly match (scheme + host + port) an entry in `allowed_origins`. The result page uses that origin as the `postMessage` targetOrigin, never `*`.
  - `mode=redirect`: `redirect_uri` must exactly match an entry in `redirect_uris`.
  - `mode=loopback`: only `http://127.0.0.1:{any port}/callback` or `http://[::1]:{any port}/callback`, per RFC 8252 §7.3. `localhost` and other paths are rejected.
  - **Test-mode exception:** `pk_test_` keys may also use `http://localhost:*` and `http://127.0.0.1:*` origins.
  - If a project has no `allowed_origins`, web_message and redirect modes are disabled for it.
- **Supporter web session.** The `/connect`, `/checkout` and `/account` pages share a first-party session: cookie `__Host-sk_web`, HttpOnly, Secure, SameSite=Lax, 12-hour lifetime. This is separate from SDK sessions. Every state-changing POST carries a CSRF token.
- **Provider OAuth `state`.** Each state is random, single-use and expires after 10 minutes. It is bound to the browser by a nonce in a pre-auth cookie. Each flow has its own state namespace and callback path:
  - `/oauth/{provider}/callback/maintainer-login`
  - `/oauth/{provider}/callback/maintainer-connect`
  - `/oauth/{provider}/callback/supporter`

  A state that doesn't match its flow or its browser is rejected. This matters because one GitHub OAuth App serves all three flows.
- **Consent.** Every sign-in shows the project name and icon, the identity being used, and: *"‹Project› will see your contributions to ‹maintainer›, and which of your linked accounts made them."*

### 5.2 Flows

| Host | Flow |
|---|---|
| Browser app | `signIn()` must be called from a click handler. It opens the popup **synchronously** to `sponsorkit.io/connect?pk=…&challenge=…&mode=web_message&origin=…`. The user picks a provider and completes provider OAuth. The page `postMessage`s a one-time code to the validated origin, and the SDK exchanges `code + verifier`. If the popup is blocked (`window.open` returns `null`), the SDK falls back to `mode=redirect` when `redirect_uris` are configured. Otherwise it rejects with `popup_blocked`. |
| CLI / desktop with a local browser | **Loopback.** The SDK listens on `127.0.0.1:{random}/callback` and opens the system browser to `/connect?…&mode=loopback&redirect_uri=…`. The exchange is the same as for browsers. |
| Headless / SSH / container | **Device code** (RFC 8628). `POST /v1/auth/device` returns `userCode` and `verificationUri` (`sponsorkit.io/device`). The SDK prints them and polls `/v1/auth/token`, respecting `interval` and `slow_down`. `userCode` is 8 characters from a 20-letter alphabet without vowels or lookalikes (≈34 bits) and expires in 10 minutes. After 5 wrong entries per IP or per code, the code is invalidated. The `/device` page shows the project, the client kind, and when and from roughly where the code was requested. Device sessions expire after 30 days of inactivity. |
| Auto-pick | Native SDKs use loopback. They fall back to device code when there is no display (`DISPLAY`/`WAYLAND_DISPLAY` unset on Linux), when `SSH_CONNECTION` is set, or when opening the browser fails. |
| Stripe payers (email) | **Magic link plus code.** The user enters an email address, which is normalized (trimmed and lowercased; `+tags` are kept). They receive an email containing a link and a 6-digit code. The link opens a confirmation page and is consumed only by a POST (a button), so email scanners that follow links don't consume it. The flow completes only in the browser that started it (cookie-bound). In any other browser the user is told to type the 6-digit code into the original tab instead. Single-use, 15 minutes, rate-limited per address and per IP. |

### 5.3 Linking and merging

- **Linking.** In `/connect` or `/account`, a signed-in supporter (web session) can add a provider. A newly seen identity is attached to the current supporter. The page always shows "Signed in as GitHub @alice · Linked: Patreon".
- **Merging.** If the identity being added already belongs to *another* supporter, nothing happens silently.
  - Merging is offered **only in `/account`**. It requires **fresh re-authentication of both identities** within the last 5 minutes.
  - The confirmation screen shows both supporters' identities and active Stripe subscriptions.
  - After the merge, Sponsorkit emails every known address on both sides. The merge can be undone within 7 days.
  - `/connect` never merges. It signs in as the existing owner of that identity and offers "manage in /account".
- **Email identities can never trigger a merge** on their own, because both sides must be proven with provider OAuth or a fresh magic link.
- **Removing.** An identity can be removed from `/account`. Sponsorkit calls the provider's token-revoke endpoint where one exists. Contributions that came through that identity stop resolving to this supporter.

### 5.4 SDK sessions

- **Token.** Opaque: `sks_` plus 32 random bytes. Scoped to one supporter, one project and one mode.
- **Lifetime.** Rolling expiry of 180 days, extended on use. Device-flow sessions use 30 days.
- **Revocation.** From `/account`, from `signOut()`, or automatically when an identity is removed.
- **Headers.** The session token goes in `Authorization: Bearer sks_…`. The public key goes in `Sponsorkit-Key: pk_…`. The key and session must agree on project and mode.

### 5.5 Provider OAuth details

| Provider | App | Supporter scopes | Maintainer-connect scopes | Notes |
|---|---|---|---|---|
| GitHub | One OAuth App, device flow enabled | `read:user read:org` | `read:user read:org` (org listing: must be org admin) | Identity key is `databaseId`, never `login`. **To verify during the build:** does `read:user` return `tier.monthlyPriceInCents`? If not, request `user` (D6). |
| Open Collective | OAuth2 app (prod; staging app for test mode) | `orders incognito` | `account webhooks orders transactions` | Identity key is account `id`. Tokens last 90 days with no documented refresh. When one expires: mark the identity's `token_status=expired`, keep the last-known data with `stale: true`, and prompt the user to reconnect in `/account`. |
| Patreon | One v2 client | `identity identity.memberships` | `campaigns campaigns.members w:campaigns.webhook` | Scopes are always passed explicitly; without them the API defaults to v1 scopes. Every `fields[...]` must be listed. Refresh tokens rotate, so store the new one on every refresh. After a 401, refreshing stops until the user signs in again, to stay under Patreon's 4xx ban threshold. |
| Stripe | Connect (§8.3) | n/a (email identity) | n/a | |

## 6. Contribution data & freshness

### 6.1 Result shape (JSON; the same in every SDK)

```jsonc
{
  "signedIn": true,
  "disabled": false,
  "supporter": {
    "id": "sup_p_…",                        // pairwise: differs per project (§6.4)
    "identities": [                          // only identities relevant to this project (§6.4)
      { "provider": "github", "id": "583231", "handle": "alice" }
    ]
  },
  "contributions": [
    {
      "id": "con_…",
      "provider": "github",                 // github | opencollective | patreon | stripe | test
      "sponsor": { "type": "user", "provider": "github", "id": "583231", "handle": "alice" },
      "via": "direct",                      // direct | organization (§6.5)
      "kind": "recurring",                  // recurring | one_time
      "frequency": "monthly",               // one_time | monthly | yearly
      "status": "active",                   // §6.2
      "amount": { "value": 500, "currency": "USD" },  // minor units; the pledge, excluding any covered fee
      "tier": { "id": "ST_…", "name": "Coffee" },     // nullable
      "flags": [],                          // trial | gifted | via_patreon | fee_covered
      "startedAt": "2026-03-01T10:00:00Z",
      "endedAt": null,
      "lastChargedAt": null,                // null where the provider does not expose it
      "nextChargeAt": null,
      "totalContributed": null,             // { value, currency } where available; its own currency
      "payments": []                        // where available (see 6.3 table)
    }
  ],
  "fetchedAt": "2026-11-16T18:00:00Z",      // when the server last refreshed from providers
  "stale": false,                           // some provider could not be refreshed
  "fromCache": false                        // served from the SDK's local cache
}
```

When signed out or disabled, the result is `signedIn: false` (or `disabled: true`), `supporter: null`, `contributions: []`, `fetchedAt: null`.

### 6.2 Status values & provider mapping

**Status values:**

- `active`
- `pending_cancellation`: still active until the period ends
- `paused`
- `past_due`
- `cancelled`
- `paid`: a completed one-time payment
- `refunded`
- `disputed`
- `failed`
- `pending`

The SDK helper `active()` returns `active` and `pending_cancellation`. Unknown future provider values map to `pending` (non-active) and are logged.

**GitHub Sponsors:**

| Provider data | Status |
|---|---|
| `isOneTimePayment=true` | `paid` (regardless of `isActive`) |
| Recurring and `isActive=true` | `active` |
| Recurring and `isActive=false` | `cancelled` |
| Webhook `pending_cancellation`, or a `PENDING_CHANGE` activity that cancels | `pending_cancellation` |
| A `REFUND` activity | `refunded` |
| `paymentSource=PATREON` | Adds the `via_patreon` flag, so maintainers can de-duplicate against a Patreon connection |

**Open Collective:**

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

Membership (`memberOf`/`BACKER`) is never used for status, because it survives cancellation.

**Patreon:**

| Provider data | Status |
|---|---|
| `active_patron` | `active`. Adds the `trial` flag if `is_free_trial`, and `gifted` if `is_gifted`. |
| `declined_patron` | `past_due` |
| `former_patron` | `cancelled` |
| `null` (free member or follower) or an entitled amount of 0 | Not a contribution |

**Stripe subscriptions:**

| Provider status | Status |
|---|---|
| `active`, `trialing` | `active` |
| `active` with `cancel_at` or `cancel_at_period_end` | `pending_cancellation` |
| `past_due`, `unpaid` | `past_due` |
| `paused` | `paused` |
| `incomplete` | `pending` |
| `incomplete_expired` | `failed` |
| `canceled` | `cancelled` |

**Stripe one-time payments:**

| Provider data | Status |
|---|---|
| PaymentIntent succeeded (incl. async success) | `paid` |
| Async payment failed | `failed` |
| Full refund | `refunded` (a partial refund adds a payment row instead) |
| `charge.dispute.created` | `disputed` |

### 6.3 Where the data comes from

| Provider | Inbound webhooks | Supporter-token refresh | Maintainer-side sync | `payments` history |
|---|---|---|---|---|
| GitHub | `sponsorship` events. The maintainer pastes our per-connection URL and secret into their Sponsors dashboard (no API exists); the dashboard shows instructions and the last delivery. Verified with HMAC-SHA256 (`X-Hub-Signature-256`). Deduplicated by `X-GitHub-Delivery`. | `viewer.sponsorshipsAsSponsor(activeOnly:false, maintainerLogins:[…])`, plus org memberships (§6.5) | Full sync every 24 h: `sponsorshipsAsMaintainer(includePrivate:true, activeOnly:false)` plus `sponsorsActivities(period:ALL)` | None. GitHub exposes no charges. `lastChargedAt` and `nextChargeAt` are null. Currency is always USD. |
| Open Collective | One `ACTIVITY_ALL` webhook per collective, created via the API. **Unsigned**, so the URL carries a 32-byte per-connection token. Delivery is one-shot with no retry. Payloads with an order trigger a re-fetch of that order by `publicId`. Empty payloads (refund, failure, dispute) trigger an incremental sync. Re-fetches are debounced to at most one per order per minute. | `me.orders(filter:OUTGOING, oppositeAccount, includeIncognito:true)`, plus the collectives the user administers (§6.5) | Incremental hourly sync (`orders(filter:INCOMING, dateFrom: now-48h)`) and a full sync every 24 h | Yes, from `transactions` (`kind: CONTRIBUTION`) |
| Patreon | Created via the API with triggers `members:create`, `members:update`, `members:delete`, `members:pledge:create`, `members:pledge:update`, `members:pledge:delete`. Verified with HMAC-MD5 (`X-Patreon-Signature`). Treated as a hint that triggers a re-fetch of the member. Paused webhooks are re-enabled by the tick. | `/identity?include=memberships&fields[member]=patron_status,currently_entitled_amount_cents,will_pay_amount_cents,campaign_lifetime_support_cents,pledge_cadence,last_charge_date,last_charge_status,next_charge_date,pledge_relationship_start,is_free_trial,is_gifted`. Memberships are matched on `relationships.campaign.data.id` against the connection. Memberships to other campaigns are discarded and never stored. | Full sync every 24 h: campaign members with `pledge_history` (500 per page) | Yes, from `pledge_history` events (each in its own `currency_code`) |
| Stripe | Platform endpoint and Connect endpoint (§8.3), signature-verified, deduplicated by `event.id`, routed by `event.livemode` | n/a (stored from webhooks) | A daily reconciliation of each connection's subscriptions | Yes, from invoices and charges |
| Test | Simulated from the dashboard (§10.4) | Simulated | Simulated | Simulated |

- **Currencies.** Every money field carries its own currency.
  - Patreon: `amount` uses the entitled amount in the campaign currency; **to verify against live data during the build**. `totalContributed` uses `campaign.currency`. Payments use `currency_code`. Tier prices are USD.
- **Freshness.**
  - `getFinancialContribution()` returns stored data unless it is older than the client's requested `freshness`. The default is 1 h; the allowed range is 1 min to 24 h, and the server enforces the 60 s floor.
  - A refresh happens at most once per (supporter, provider) per 60 s, whatever clients ask for.
  - Per-provider token buckets protect the shared app quotas: Patreon allows 100 requests/min per token and Open Collective 100/min.
  - A refresh failure never errors. It returns the stored data with `stale: true`.

### 6.4 Privacy

- **One privacy filter** is applied to **every** maintainer-facing output: the dashboard, CSV export, the server list and lookup APIs (§7.3), and outbound webhooks (§7.5).
  - A contribution is **private** if the supporter set `visibility=private`, or the provider marks it private: a GitHub `PRIVATE` sponsorship, an Open Collective incognito order, or a masked Patreon identity.
  - Private contributions appear as "Private supporter" with amount, frequency and status only, and no identity fields.
  - Lookups by identity never match private rows.
  - Private GitHub sponsors are hidden in Sponsorkit too, even though GitHub itself shows them to the maintainer. This was an explicit choice.
- **Pairwise supporter IDs.**
  - Every project sees `sup_p_` + base32(HMAC(server_key, project_id ‖ supporter_id)).
  - Two unrelated projects cannot correlate a person by ID.
  - Inside Sponsorkit the real `supporter_id` is used.
- **Minimal identity disclosure.**
  - `supporter.identities` contains only (a) the identity used for the current session and (b) identities with at least one contribution on the project's connections.
  - An email address is only ever shown to the project whose Stripe connection that email paid.
- The SDK always returns the **signed-in supporter's own** contributions to that project, regardless of visibility, because the supporter consented at sign-in (§5.1).

### 6.5 Organization sponsorships

- A GitHub org (or an Open Collective organization/collective) can sponsor a maintainer.
- During supporter-token refresh, Sponsorkit records the user's org memberships and roles in `identity_memberships`:
  - GitHub: `viewer.organizations` plus `viewerCanAdminister`.
  - Open Collective: `me.memberOf(role: ADMIN)`.
- An org's contributions are **always** returned to its members, marked with `via: "organization"` and `sponsor.type: "organization"` (decided in D5). The developer decides whether they count. `fc.direct()` filters them out.
- Private org sponsorships may be invisible to non-admin members. This is documented.

## 7. HTTP API (`https://api.sponsorkit.io/v1`)

- Requests and responses are JSON with camelCase fields.
- Errors use `application/problem+json` with a stable `code`: `invalid_public_key`, `invalid_secret_key`, `mode_mismatch`, `session_revoked`, `rate_limited`, `invalid_request`, `not_found`, `provider_unavailable`.
- Each response carries a request ID in `Sponsorkit-Request-Id`. A `429` response includes `Retry-After`.

### 7.1 Client API (`Sponsorkit-Key: pk_…`, plus a session bearer where noted)

**Auth**

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /auth/token` | pk | Exchanges `{code, codeVerifier}` or `{deviceCode}` for `{sessionToken, expiresAt, result}`. `result` is the §6.1 shape. |
| `POST /auth/device` | pk | Returns `{deviceCode, userCode, verificationUri, verificationUriComplete, interval, expiresIn}`. |

**Supporter data**

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /me/contributions?freshness=3600` | pk + session | Returns the §6.1 result. |
| `DELETE /me/session` | pk + session | Signs out. |

**Checkout**

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /projects/{pk}/checkout` | pk | Public config. Per enabled provider: `currency`, `frequencies`, `tiers`, `customAmount`, `minAmount`. Also project presets and default currency. |
| `POST /checkout/sessions` | pk (+ session optional) | Body: `{amount?, currency?, frequency?, allowedFrequencies?, allowCustomAmount?, providers?, lockAmount?, origin?, returnTo?, codeChallenge?}`. Returns `{id, clientSecret, url, expiresAt}`. Options are clamped to project config. `returnTo` and `origin` must match `allowed_origins`. With no session, `codeChallenge` is required (§8.1, step 6). |
| `GET /checkout/sessions/{id}` | pk + `Sponsorkit-Checkout-Secret` | Returns `{status, provider?, contribution?, code?}`. `status` is `open`, `completed`, `returned`, `abandoned` or `expired`. `code` is returned once, for a signed-out checkout handoff. |

CORS on the client API allows any origin without credentials. Origins don't matter here, because every request is authenticated by bearer token or key.

### 7.2 Hosted pages (sponsorkit.io)

| Path | Purpose |
|---|---|
| `/connect` | Supporter sign-in and linking (§5) |
| `/device` | Enter a device code |
| `/checkout/{cs_id}` | Checkout flow for an SDK-created session (§8.1) |
| `/c/{pk}?amount=&currency=&frequency=` | **Stable, never-expiring checkout link.** Creates an anonymous checkout session lazily when opened. Used by `checkoutUrl()` and by README badges. |
| `/account` | Supporter self-service: identities, merge, visibility, Stripe subscriptions (Stripe customer portal), active sessions |

### 7.3 Server API (`Authorization: Bearer sk_…`)

- No CORS headers are sent.
- A request carrying an `Origin` header is rejected, to discourage putting secret keys in browsers.
- Requests are rate-limited per key.

| Method & path | Purpose |
|---|---|
| `POST /sessions/introspect` | `{sessionToken}` → `{active, supporter, result}`. `active` is false unless the session belongs to **this key's project and mode** and is not revoked. |
| `GET /supporters/{pairwiseId}/contributions` | Same shape as `/me/contributions`. Returns 404 unless the supporter has a session with this project or a contribution on its connections. |
| `GET /contributions?provider=github&providerUserId=583231` | Lookup by immutable provider ID. Private rows are excluded. Handle lookups are **not** offered, because handles can be renamed and reclaimed. |
| `GET /contributions?provider=stripe&email=…` | Exact match on the normalized address, limited to this project's Stripe connections, rate-limited strictly |
| `GET /contributions?status=active&cursor=…` | Lists contributions on the project's connections, with the privacy filter applied |

### 7.4 Web-internal API

- `/web/*` on the API is reachable only from the Next server, authenticated with a shared service credential. It carries the maintainer's and supporter's identity from their `__Host-` cookie sessions.
- It covers:
  - maintainer GitHub login;
  - projects: CRUD, origins, redirect URIs, checkout config;
  - keys: create and revoke secret keys, rotate public keys;
  - provider connections and webhook setup status;
  - supporter list and CSV export;
  - outbound webhook endpoints, delivery log and redelivery;
  - test-provider simulation;
  - all supporter `/account` operations.
- It is not a public contract.

### 7.5 Outbound webhooks (to maintainers)

**Events**

- `contribution.created`
- `contribution.updated` (amount, tier or status changed)
- `contribution.cancelled`
- `contribution.payment_succeeded`
- `contribution.payment_failed`
- `contribution.refunded`
- `supporter.linked`: an identity with contributions on this project got linked to a supporter. Pairwise IDs only.

**Payload and signature**

- The payload is `{id, type, mode, createdAt, projectId, data: {supporter, contribution}}`, with the privacy filter applied.
- The signature is sent as `Sponsorkit-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<rawBody>")>`.
- Each SDK's server entry point ships a verifier with a 5-minute tolerance. Consumers should deduplicate on `id`.

**Delivery**

- Events are written to an outbox and delivered at least once.
- Retries back off: 1 min, 5 min, 30 min, 2 h, 6 h, then every 12 h, for 3 days.
- After 3 days of failure the endpoint is disabled and the maintainer is emailed.

**SSRF protection**

- **URL rules.** Only `https` URLs on port 443 with a hostname are accepted; IP literals are refused.
- **Address checks.** At connect time, DNS is resolved, and private, loopback, link-local, CGNAT, multicast, metadata and IPv4-mapped addresses are refused. The connection is pinned to the vetted IP through a `SocketsHttpHandler.ConnectCallback`.
- **Request limits.** No redirects are followed. Timeout is 10 s. Responses are read up to 64 KB, and only the status code is stored.

## 8. Checkout

### 8.1 Hosted flow

`openCheckout(opts)` behaves differently per environment:

- **Browser.** It opens a popup **synchronously** inside the click handler, at `sponsorkit.io/checkout/new?pk=…&opts=…&origin=…`. The page creates the session server-side, so there is no await before `window.open`. If the popup is blocked, it falls back to a redirect when `returnTo` is set, and otherwise rejects with `popup_blocked`.
- **Native SDKs.** They call `POST /checkout/sessions` and open the system browser at the returned URL.

The page then walks through these steps:

1. **Amount.** Preset buttons, plus a custom amount if allowed. The `amount` option preselects a value; `lockAmount` fixes it. Values below the provider or project minimum are raised to that minimum.
2. **Frequency.** One of `one_time | monthly | yearly`, limited to `allowedFrequencies`.
3. **Provider.** Only providers that can satisfy the selection are enabled. Each disabled provider shows why. The rules:
   - **Currency must match exactly.** There is no conversion. GitHub is USD; Open Collective and Patreon use their connection's currency; Stripe accepts any currency.
   - **Frequency.** GitHub: monthly or one-time. Patreon: monthly only. Open Collective and Stripe: all three.
   - **Tiers (GitHub, Patreon).** Pick the cheapest tier at or above the amount. If none is high enough, pick the highest tier. If the connection has no tiers, the provider is disabled.
4. **Identify.**
   - The supporter signs in with the chosen provider, or with email for Stripe. This happens in the shared web session (§5.1).
   - If the checkout was created by a signed-in SDK session, the person in the browser must prove an identity **already linked** to that supporter, or explicitly choose "continue as someone else". The checkout URL alone never grants linking or attribution.
   - `/c/{pk}` links are always anonymous.
5. **Pay.**
   - **Stripe:** a Checkout Session on the **platform**:
     - `price_data` with the exact amount, plus `recurring.interval` for subscriptions;
     - `transfer_data.destination = acct_X` and `on_behalf_of = acct_X`, so the maintainer is the merchant of record;
     - `client_reference_id` set to the checkout session ID, and `submit_type=donate` for one-time payments;
     - the Customer is reused per (supporter, connection).
   - **Open Collective:** redirect to `opencollective.com/{slug}/donate?amount=…&interval=month|year&redirect=…`.
   - **GitHub Sponsors:** redirect to the chosen tier on `github.com/sponsors/{login}`.
   - **Patreon:** redirect to the tier's `url` attribute (stored on the connection), or to the campaign URL as a fallback.
   - *To verify during the build:* GitHub's tier and frequency URL parameters, and whether Patreon or Open Collective append anything to the return URL.
6. **Return.**
   - **Status.**
     - Stripe moves to `completed` when its webhook confirms payment.
     - Redirect providers move to `returned`. This triggers an immediate refresh of that supporter's contributions, and the contribution is linked when it appears (it may take minutes).
     - A session nobody finishes becomes `abandoned` after 2 h and `expired` at 24 h.
   - **Signed-out checkout.** The page issues a one-time handoff code bound to the SDK's `codeChallenge`. The SDK receives it through `postMessage`, the loopback callback, or the `code` field of `GET /checkout/sessions/{id}`, and exchanges it at `/auth/token`. The user ends up **signed in** after paying.
   - **SDK result.** `openCheckout()` resolves with `{status: "completed" | "returned" | "cancelled", contribution?, signedIn}`.
     - Browser SDK: polls `GET /checkout/sessions/{id}` after a `postMessage` arrives or the popup closes.
     - Native SDKs: poll every 3 s until the session reaches a terminal status, the caller's timeout or cancellation (`AbortSignal`, `CancellationToken`, `context.Context`, …), or `expiresAt`.
     - If the popup closes while the session is still `open`, or the timeout is reached, the result is `cancelled`.

### 8.2 Project checkout config (dashboard)

- Enabled providers and their order.
- Default currency.
- Preset amounts.
- Minimum amount.
- Whether custom amounts are allowed.
- Allowed frequencies.
- "Cover processing fees" behaviour (D1).
- Thank-you message.
- Return URL, which must be in `allowed_origins`.

### 8.3 Stripe Connect specifics

- **Account creation.** Connected accounts are created with **controller properties** equivalent to Express: Express dashboard, Stripe collects requirements, the platform pays fees and carries losses. Accounts request the `card_payments` and `transfers` capabilities. (Stripe now marks `type=express` deprecated.)
- **Onboarding and readiness.** Onboarding uses Account Links. Readiness is tracked through `account.updated`. Checkout stays unavailable for a connection until `charges_enabled`. Maintainers reach the Express dashboard through on-demand login links.
- **Webhooks.**
  - Platform endpoint: `checkout.session.completed`, `checkout.session.async_payment_succeeded|failed`, `invoice.created` (fee setting, D1), `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created|updated|deleted`, `charge.refunded`, `charge.dispute.created|closed`.
  - Connect endpoint: `account.updated`, `account.application.deauthorized`.
  - Events are routed by `event.livemode`, and are rejected if that doesn't match the connection's mode.
- **Cancellation.** Supporters cancel through the Stripe customer portal (`on_behalf_of` the maintainer), linked from `/account`.
- **Disconnect.** When a maintainer disconnects, Sponsorkit cancels that connection's subscriptions at the end of the period and emails the affected supporters.
- **SDK pinning.** Stripe.net is pinned, together with its bundled API version (`2026-10-28.endive` at the time of writing).

## 9. SDKs

### 9.1 Client API (TypeScript shown; other languages use idiomatic names, §9.3)

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({
  publicKey: "pk_live_…",
  cacheTtl: 3600,        // seconds the SDK serves its local cache without calling the API
  freshness: 3600,       // max age of provider data the API may return (server floor 60s)
  storage: undefined,    // default: localStorage (browser) / per-user config dir (native)
  apiBaseUrl: undefined, // override for tests / self-hosting
});

await sk.signIn();                         // call from a click handler in browsers
await sk.signIn({ provider: "github" });   // skip the picker
sk.isSignedIn();                           // local check, no network

const fc = await sk.getFinancialContribution();  // §6.1 result; never throws for network/server issues
const fresh = await sk.getFinancialContribution({ cacheTtl: 0 }); // skip local cache; server freshness still applies

const r = await sk.openCheckout({
  amount: 500, currency: "USD",
  frequency: "monthly", allowedFrequencies: ["monthly"],
  allowCustomAmount: true,
  signal,                                  // optional cancellation
}); // { status: "completed" | "returned" | "cancelled", contribution?, signedIn }

sk.checkoutUrl({ frequency: "monthly", amount: 500 }); // sync, offline-safe: https://sponsorkit.io/c/pk_…?…
sk.accountUrl();                                       // sync: "manage my contribution" link
await sk.signOut();                                    // revokes; clears token + cache
```

**Helpers.** These filter only. They never sum across providers or currencies.

- `fc.active()`: `active` and `pending_cancellation`.
- `fc.recurring()`, `fc.oneTime()`.
- `fc.byProvider(p)`.
- `fc.direct()`: excludes organization contributions.

The maintainer writes their own rule:

```ts
const supporting = fc.active().some(c =>
  c.frequency === "monthly" && c.amount.currency === "USD" && c.amount.value >= 500);
if (!supporting) showAd();
```

### 9.2 Error contract (identical in all SDKs, enforced by the conformance suite)

| Situation | Behaviour |
|---|---|
| Invalid or revoked public key, `mode_mismatch` | **Throws** `SponsorkitError{code}`. This is a developer error that must surface in development. |
| Not signed in | Returns `{signedIn:false, supporter:null, contributions:[]}`. Makes no network call. |
| `session_revoked` / expired | Clears the token and cache, then returns as if not signed in. |
| Network error, 5xx, `rate_limited` | Returns the last cached result (`fromCache:true, stale:true`). If nothing is cached, returns the signed-in-but-empty result with `stale:true`. Honours `Retry-After`. **Never throws.** |
| `SPONSORKIT_DISABLE=1` | No network or disk access. Returns `disabled:true` (signed out, empty). `nag.due()` returns false. `signIn` and `openCheckout` reject with `disabled`. |
| Popup blocked (browser) | `signIn`/`openCheckout` reject with `popup_blocked`, unless the redirect fallback applies. |

Rules should therefore check `fc.disabled || !fc.signedIn` before nagging or showing ads. The docs say so prominently.

### 9.3 Nag helper

```ts
const nag = sk.nag({ id: "my-cli", every: 10, orEvery: "P7D" });
if (await nag.due(fc => fc.active().length === 0)) {
  console.error(`❤️ Enjoying my-cli? Support it: ${sk.checkoutUrl({ frequency: "monthly" })}`);
  nag.shown();
}
```

- **Run counter.** Incremented once per process per `id`, on the first `due()` call. Stored next to the cache, keyed by `(pk, id)`.
- **When `due()` is true.** It returns `predicate(result) && (runs >= every || now - lastShown >= orEvery)`. Both the counter and `lastShown` reset on `shown()`. Durations are ISO-8601, or the language's native duration type.
- **Data source.** `due()` uses `getFinancialContribution()` and therefore follows its never-throw rules.
- **When `due()` is false regardless.** When `SPONSORKIT_DISABLE`, `SPONSORKIT_NO_NAG` or `CI` is set, or when stdout or stderr is not a TTY. `{ force: true }` overrides this, and libraries should not pass it.
- **No implicit sign-in.** Libraries consuming the SDK must not trigger sign-in; `signIn()` is never called implicitly.

### 9.4 Local storage

- **Location.**
  - Browser: `localStorage`.
  - Native: `$XDG_CONFIG_HOME/sponsorkit` (Linux), `~/Library/Application Support/sponsorkit` (macOS), `%APPDATA%\sponsorkit` (Windows).
  - Directory mode `0700`, files `0600`; a user-only ACL on Windows.
- **Contents.** One file per public key holds the session token. The cache is keyed by `(pk, pairwise supporter id)`.
- **Writes** are atomic (write a temp file, then rename), so concurrent CLI processes can't corrupt them.
- **Keychain.** Optional OS keychain storage for the token where available, via an opt-in flag in v1.
- **Clearing.** `signOut()` and `session_revoked` clear both the token and the cache.

### 9.5 Web components & server entry point

- **`@sponsorkit/sdk/elements`.**
  - `<sponsorkit-button public-key amount frequency>` opens the checkout synchronously on click.
  - `<sponsorkit-badge>` shows "Supporter ♥" when `active()` is non-empty.
  - Both are framework-agnostic and themed with CSS custom properties.
- **`@sponsorkit/sdk/server`, and the equivalent in each language.**
  - `new SponsorkitServer({ secretKey })` exposes `introspect()`, `getContributions(supporterId)`, `findContributions({provider, providerUserId | email})` and `listContributions()`.
  - `webhooks.verify(rawBody, signatureHeader, secret)` verifies outbound webhooks.

### 9.6 Per-language surface

| | JS/TS | .NET | Python | Go | Rust |
|---|---|---|---|---|---|
| Package | `@sponsorkit/sdk` | `Sponsorkit` | `sponsorkit` | `github.com/sponsorkit/sponsorkit.io/sdks/go` | `sponsorkit` |
| Get | `getFinancialContribution()` | `GetFinancialContributionAsync(ct)` | `get_financial_contribution()` / `aget_…` | `GetFinancialContribution(ctx)` | `get_financial_contribution().await` |
| Sign in | popup, redirect, loopback, device | loopback, device | loopback, device | loopback, device | loopback, device |
| Checkout | popup / system browser | system browser | system browser | system browser | system browser |
| UI elements | ✅ | – | – | – | – |
| Nag, cache, error contract | ✅ | ✅ | ✅ | ✅ | ✅ |
| Server client + webhook verify | ✅ | ✅ | ✅ | ✅ | ✅ |
| Runtime floor | Node 20+, evergreen browsers | netstandard2.0 / net8.0 | 3.10+ | Go 1.23+ | MSRV 1.85 |
| Runtime deps | none | System.Text.Json (netstandard only) | `httpx` | stdlib | `reqwest` (rustls), `serde`, `tokio` |

### 9.7 Conformance suite

`sdks/conformance/` contains a small fake API server and JSON fixtures. Every SDK runs these scenarios in CI:

- signed out
- device sign-in
- loopback sign-in
- cache hit
- offline with cache
- offline without cache
- session revoked
- invalid key throws
- mode mismatch
- disabled
- rate-limited with `Retry-After`
- checkout completed signed-in
- checkout completed signed-out (handoff)
- checkout cancelled or timeout
- nag counting
- file permissions
- concurrent writes
- webhook signature valid, tampered, expired

## 10. Operations

### 10.1 Rate limiting

Token buckets are stored in Postgres per IP, per public key, per secret key and per supporter. Starting values:

| Endpoint group | Limit |
|---|---|
| `/auth/*` | 30/min per IP |
| `/auth/device` code entry | 5 attempts per code |
| `/me/contributions` | 60/min per session |
| `/checkout/sessions` | 20/min per IP |
| Server API | 600/min per key; email lookup 30/min |
| Magic link | 3 per address per 15 min |

Cloudflare (D2) can also front the API for free edge protection.

### 10.2 Inbound webhooks

- Each provider event is recorded in `inbound_events` with a unique key, so duplicates are dropped.
- **Payloads are hints.** Every inbound webhook triggers a re-fetch of the authoritative object, except for Stripe, whose events are signed and timestamped.
- Per-connection URL tokens are 32 bytes, compared in constant time and rotatable from the dashboard.

### 10.3 Observability

- Structured logs go to Cloud Logging.
- Each provider sync records `last_*_sync_at` and its error.
- The dashboard shows per-connection health: last webhook received, last sync, token status.

### 10.4 Test mode

- **Keys.** `pk_test_`/`sk_test_` keys see only test-mode connections, sessions and contributions. Modes are checked on every request.
- **Stripe.** Test mode uses Stripe test keys and a separate test connected account.
- **Open Collective.** Test mode uses OC staging (separate OAuth app) when its credentials are configured.
- **GitHub and Patreon** have no sandboxes. Test mode instead offers the built-in **Test provider**.
  - The maintainer creates simulated supporters and contributions from the dashboard: any status, amount, frequency or org membership.
  - Status changes can be triggered on demand.
  - It produces the same §6.1 shapes and outbound webhooks.
  - Sign-in to it on `/connect` uses a "Sign in as test supporter" picker.
  - The conformance suite and e2e tests use it.

## 11. Delivery plan (after approval)

All work lands in this PR as reviewable commits:

1. **API foundation.**
   - .NET 10 solution, EF model and migrations.
   - Maintainer GitHub login, projects and keys, modes.
   - Problem details, rate limiting.
   - OpenAPI generation; Testcontainers tests.
2. **Supporter auth.** Web session, connect, popup, redirect, loopback, device, magic link, linking and merging, SDK sessions, pairwise IDs.
3. **Providers.**
   - Test provider first, then GitHub Sponsors, Open Collective, Patreon and Stripe Connect.
   - Each provider gets OAuth, sync, inbound webhooks, and a WireMock test suite built from documented payloads.
4. **Checkout.** Hosted flow, provider eligibility, Stripe Checkout Sessions, handoff codes.
5. **Outbound webhooks.** Outbox, tick service, retries, signing, SSRF-safe sender.
6. **Web.** Landing page, docs, dashboard, hosted pages. Playwright e2e against the API using the Test provider.
7. **SDKs.** JS/TS first (the reference), then .NET, Python, Go and Rust. All pass the conformance suite.
8. **CI/CD.**
   - GitHub Actions: build and test per component.
   - Deploy the API and tick service to Cloud Run, and the web to its host.
   - Trusted publishing to npm, NuGet, PyPI and crates.io. Go releases use tags `sdks/go/vX.Y.Z`.

**Definition of done.**

- Everything builds.
- All tests pass with the Test provider and with WireMock'd real providers.
- Going live needs only the credentials in §14.
- Items marked *to verify during the build* are checked against real provider sandboxes or docs where possible. Any that can't be verified are listed in the PR.

## 12. Build-time verifications

These come from the research and could not be confirmed from documentation alone:

- GitHub: the scope needed for tier amounts and private sponsorships, and the checkout URL parameters.
- Open Collective: whether `includeIncognito` works with a user OAuth token, and refresh-token support.
- Patreon: the currency of `currently_entitled_amount_cents`, and the tier `url` checkout link.
- Stripe: the exact Accounts v1 controller parameters for Express-equivalent accounts.

## 13. Decisions

| # | Decision | Outcome |
|---|---|---|
| **D1** | **Stripe processing fees.** With destination charges, Stripe bills the platform. | ✅ **Pass the fee through.** Sponsorkit takes an `application_fee_amount` equal to the estimated Stripe fee: set at checkout for one-time payments, and on each `invoice.created` for subscriptions. A "cover processing fees" checkbox, on by default, grosses up the supporter's amount. Sponsorkit roughly breaks even, and small over- or under-recovery is accepted. `amount` in §6.1 stays the pledge; the `fee_covered` flag marks gross-ups. |
| **D2** | **Web hosting.** Vercel Hobby is for non-commercial use only. | ✅ **Cloudflare Workers via OpenNext** (free; also gives edge rate limiting). |
| **D3** | **Patreon consent scope** `identity.memberships`. | Proposed: accept it. Only memberships to connected campaigns are stored. |
| **D4** | **Package names**: `@sponsorkit` npm, `Sponsorkit` NuGet, `sponsorkit` PyPI and crates.io. | Proposed: reserve them now; fall back to `sponsorkit-sdk` where a name is taken. |
| **D5** | **Org sponsorships.** | ✅ **Always included for org members**, marked `via: "organization"`. The developer filters (`fc.direct()`). |
| **D6** | **GitHub scope.** `user` is needed if `read:user` doesn't return tier amounts. | Proposed: use `user` only if verification requires it, and say so on the consent screen. |

## 14. What you will need to provide to go live

1. **GitHub OAuth App** with device flow enabled: client ID and secret.
2. **Open Collective OAuth apps**, production and optionally staging: client ID and secret for each.
3. **Patreon v2 client:** client ID and secret.
4. **Stripe platform account** with Connect enabled and the platform profile and branding done:
   - live and test secret keys;
   - 2 webhook secrets per mode.
5. **Google Cloud project:**
   - Cloud Run (2 services), Cloud Scheduler, Secret Manager, Artifact Registry;
   - Workload Identity Federation for GitHub Actions.
6. **Neon project:** pooled and direct connection strings (plus a test branch).
7. **Cloudflare account** (Workers, for the web app), and DNS for `sponsorkit.io` and `api.sponsorkit.io`.
8. **Transactional email** for magic links, for example the Resend free tier: API key.
9. **Registry setup:** trusted publishers on npm, NuGet, PyPI and crates.io, after the names are reserved (D4).
