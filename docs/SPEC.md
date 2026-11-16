# Sponsorkit: product & technical specification

> Status: **DRAFT, awaiting approval.** Nothing below is built yet.
> Last updated: 2026-11-16.

## 1. What Sponsorkit is

Sponsorkit lets an open source maintainer build financial contributions directly into their software.

A maintainer installs a Sponsorkit SDK in their project (npm, NuGet, PyPI, Go, crates.io). With it they can:

1. **Ask what the current user has contributed:** `getFinancialContribution()`.
2. **Let the user start contributing:** `openCheckout({ amount, frequency, … })` opens a Sponsorkit-hosted checkout.
3. **Decide what to do with that information:** show an ad when someone gives less than $5/month, show a "consider sponsoring" nag every N runs, unlock a feature, and so on. Sponsorkit only reports facts. The maintainer writes the rules.

Contributions come from **payment providers**. v1 supports:

| Provider | Recurring | One-time | Custom amount at checkout | Who the supporter is |
|---|---|---|---|---|
| GitHub Sponsors | ✅ monthly | ✅ | Tier-based (custom tiers if the maintainer enables them) | GitHub account |
| Open Collective | ✅ monthly/yearly | ✅ | ✅ (`?amount=&interval=`) | Open Collective account |
| Patreon | ✅ monthly/annual | ❌ (Patreon has none) | Tier-based | Patreon account |
| Stripe (via Sponsorkit, Connect) | ✅ monthly/yearly | ✅ | ✅ | Verified email (magic link) |

### 1.1 Non-goals (v1)

- **No aggregation or currency conversion.** Contributions are returned **per provider, as raw history**. Sponsorkit does not decide whether someone "counts" as a supporter.
- **No tamper-proofing of client-side checks.** The software is open source, so anyone can patch out a check. Server-side verification (secret key) exists for SaaS backends that need a trustworthy answer.
- **No platform fee.** Sponsorkit is free (see §11, decision D1, on Stripe processing fees).
- **No Bountyhunt.** It is removed entirely.

## 2. Actors & vocabulary

| Term | Meaning |
|---|---|
| **Maintainer** | Builds the OSS software. Signs in to `sponsorkit.io` with **GitHub only**. |
| **Project** | One piece of software that integrates Sponsorkit. Owned by a maintainer. Has a **public key** (`pk_live_…` / `pk_test_…`) and one or more **secret keys** (`sk_live_…`). |
| **Provider connection** | A maintainer's receiving account at a provider: a GitHub Sponsors listing (user or org), an Open Collective collective, a Patreon campaign, or a Stripe connected account. A project picks which connections count for it. |
| **Supporter** | An end-user of the software. A single Sponsorkit person with one or more **linked identities** (GitHub, Open Collective, Patreon, email). |
| **Session** | A supporter signed in to a specific project from a specific app instance. The SDK holds an opaque **session token** (`sks_…`). |
| **Contribution** | One normalized sponsorship, order, membership or subscription from a supporter identity to a provider connection, with its payment history. |

## 3. Architecture

```
                 ┌──────────────────────── sponsorkit.io (Next.js 16) ─────────────────────────┐
 Supporter ────▶ │ /connect   /device   /checkout/[project]   /account    /docs   /dashboard    │ ◀── Maintainer
 (browser)       └───────────────┬───────────────────────────────────────────────────┬─────────┘
                                 │ fetch (cookie / token)                            │
 SDK in app ───── HTTPS ───────▶ ▼                                                   ▼
 (pk_ / sks_)          ┌──────── api.sponsorkit.io (ASP.NET Core, .NET 10, Cloud Run) ────────┐
 SaaS backend ───────▶ │  /v1 public API   /dashboard API   /webhooks/{provider}   /internal  │
 (sk_)                 └───┬──────────────┬───────────────────┬────────────────────┬───────────┘
                           │              │                   │                    │
                    Neon Postgres   GitHub / OC / Patreon   Stripe (Connect)   Cloud Scheduler
                    (pooled)        GraphQL / REST          platform account   (1-min tick: sync,
                                                                                webhook retries)
```

- **API:** ASP.NET Core minimal APIs on **.NET 10 LTS** with EF Core 10 and Npgsql.
  - Runs on **Google Cloud Run**: min instances 0, startup CPU boost, ReadyToRun plus precompiled EF queries.
  - Native AOT is not used, because EF Core AOT is still experimental.
- **Database:** **Neon Postgres free tier**.
  - The app uses the pooled (`-pooler`) endpoint with a small pool, `SSL Mode=Require`, and EF retry-on-failure, which absorbs Neon's resume after 5 minutes idle.
  - Migrations use the direct endpoint.
- **Background work:** Cloud Run throttles CPU once a request finishes, so there are no in-process background jobs.
  - Instead, **Cloud Scheduler** calls `POST /internal/tick` every minute, authenticated by OIDC.
  - Each tick drains the outbox (outbound webhooks), retries failed deliveries, refreshes stale provider data and expires sessions and codes.
  - All of this fits in the 3 free scheduler jobs.
- **Web:** Next.js 16 (App Router, TypeScript). It serves the marketing site, docs, maintainer dashboard and the hosted supporter pages (connect, device, checkout, account).
  - Hosting: Vercel Hobby **or** Cloudflare Workers via OpenNext. See decision D2.
- **Secrets:** provider tokens are encrypted at rest with AES-256-GCM, using a key from Google Secret Manager.
  - Secret keys and session tokens are stored only as SHA-256 hashes, plus a short display prefix.

### 3.1 Repository layout (monorepo)

```
api/                     .NET solution
  src/Sponsorkit.Api/          HTTP endpoints, auth, webhooks
  src/Sponsorkit.Core/         domain, EF Core, provider adapters
  tests/Sponsorkit.Tests/      xUnit + Testcontainers Postgres + WireMock.Net provider fakes
web/                     Next.js 16 site + dashboard + hosted pages
sdks/
  js/                    @sponsorkit/sdk  (isomorphic; /browser, /node, /server, /elements entry points)
  dotnet/                Sponsorkit (NuGet; netstandard2.0 + net8.0+)
  python/                sponsorkit (PyPI; 3.10+)
  go/                    module github.com/sponsorkit/sponsorkit.io/sdks/go
  rust/                  sponsorkit (crates.io; edition 2024)
  conformance/           shared JSON fixtures + scenarios every SDK must pass
openapi/sponsorkit.v1.yaml     generated from the API, committed, diffed in CI
docs/                    this spec + ADRs
.github/workflows/       per-component CI + trusted publishing
```

## 4. Data model (Postgres)

| Table | Key columns |
|---|---|
| `maintainers` | `id`, `github_user_id` (unique, immutable), `github_login`, `email`, `created_at` |
| `projects` | `id`, `maintainer_id`, `slug` (unique), `name`, `public_key_live`, `public_key_test`, `allowed_origins text[]`, `checkout_config jsonb`, `created_at` |
| `secret_keys` | `id`, `project_id`, `mode` (live/test), `prefix`, `hash`, `name`, `last_used_at`, `revoked_at` |
| `provider_connections` | `id`, `maintainer_id`, `provider`, `external_account_id`, `handle`, `access_token_enc`, `refresh_token_enc`, `expires_at`, `webhook_secret_enc`, `webhook_token`, `webhook_status`, `last_synced_at`, `metadata jsonb` |
| `project_connections` | `project_id`, `connection_id` (many-to-many; one listing can serve several projects) |
| `supporters` | `id`, `visibility` (`public` / `private`, default `public`), `created_at` |
| `supporter_identities` | `id`, `supporter_id`, `provider` (`github` / `opencollective` / `patreon` / `email`), `external_user_id` (immutable ID, never the login), `handle`, `email`, `access_token_enc`, `refresh_token_enc`, `expires_at`; **unique(`provider`, `external_user_id`)** |
| `sessions` | `id`, `supporter_id`, `project_id`, `token_hash`, `client_kind` (browser/loopback/device), `created_at`, `last_used_at`, `expires_at` |
| `auth_requests` | Pending authorization codes, device codes, magic links: `kind`, `code_hash`, `user_code`, `pkce_challenge`, `redirect`, `project_id`, `supporter_id?`, `expires_at`, `consumed_at` |
| `contributions` | `id`, `connection_id`, `provider`, `external_id`, `supporter_external_user_id`, `supporter_id?`, `kind` (`recurring` / `one_time`), `status`, `amount_minor`, `currency`, `interval` (`month` / `year` / null), `tier_id`, `tier_name`, `started_at`, `ended_at`, `last_charged_at`, `next_charge_at`, `total_contributed_minor`, `is_private`, `raw jsonb`, `synced_at`; **unique(`provider`, `external_id`)** |
| `contribution_payments` | `id`, `contribution_id`, `external_id`, `amount_minor`, `currency`, `status`, `charged_at` |
| `stripe_customers` | `supporter_id`, `connection_id`, `customer_id` |
| `webhook_endpoints` | `id`, `project_id`, `url`, `secret_enc`, `events text[]`, `enabled` |
| `events` (outbox) | `id`, `project_id`, `type`, `payload jsonb`, `created_at` |
| `webhook_deliveries` | `id`, `endpoint_id`, `event_id`, `attempt`, `status`, `response_code`, `next_attempt_at` |

Contributions belong to a **connection**, not a project. A project sees every contribution on the connections linked to it.

`supporter_id` is filled in as soon as the identity is linked to a supporter. This also covers contributions that were synced before the supporter ever signed in.

## 5. Supporter authentication

Sponsorkit acts as an **OAuth-style authorization server for its SDKs**. Provider OAuth happens only on the server, so SDKs never see provider tokens or secrets. Every flow uses **PKCE (S256)** and `state`.

### 5.1 Flows

| Host | Flow |
|---|---|
| Browser app | `signIn()` opens a popup: `sponsorkit.io/connect?pk=…&challenge=…&mode=web_message`. The user picks a provider and completes that provider's OAuth. The page `postMessage`s a one-time code to the opener. The message is sent only to origins in the project's `allowed_origins`; `localhost` is always allowed for `pk_test_` keys. The SDK exchanges the code and verifier at `POST /v1/auth/token`. A full-page redirect is available as a fallback (`mode=redirect`). |
| CLI / desktop with a local browser | **Loopback** (RFC 8252). The SDK listens on `http://127.0.0.1:{random}/callback` and opens the system browser to `/connect?…&redirect_uri=…`. Same exchange as above. |
| Headless / SSH / container | **Device code** (RFC 8628). `POST /v1/auth/device` returns `user_code` and `verification_uri` (`sponsorkit.io/device`). The SDK prints them and polls `/v1/auth/token`, handling `authorization_pending` and `slow_down`. The verification page shows the project name and icon to reduce phishing. |
| Auto-pick | Node, .NET, Python, Go and Rust SDKs try loopback first. They fall back to device code when there's no display, when `SSH_CONNECTION` or `CI` is set, or when opening the browser fails. |
| Stripe payers | Magic link to an email address. Proves the `email` identity. |

### 5.2 Identity linking

- Signing in to **a second provider** while a session exists links that identity to the same supporter.
  - The `/connect` page shows "Linked: GitHub @alice · Add Patreon".
- If the identity already belongs to **another** supporter, the two supporter records are **merged**. Both were proven by OAuth in the same browser flow, and the user confirms the merge.
- Supporters manage linked identities, visibility and Stripe subscriptions at `sponsorkit.io/account`. They sign in there with any linked provider.
- A consent line is always shown: *"‹Project› will be able to see your contributions to ‹maintainer›."*

### 5.3 Sessions

- Session tokens are opaque (`sks_` + 32 random bytes), scoped to one supporter and one project.
- Sessions use a rolling expiry of 180 days, extended on use, and can be revoked from `/account` and via `signOut()`.
- Session tokens are sent as `Authorization: Bearer sks_…`. The public key is sent as `Sponsorkit-Key: pk_…`.

### 5.4 Provider OAuth details

| Provider | App type | End-user scopes | Notes |
|---|---|---|---|
| GitHub | OAuth App (device flow enabled) | `read:user read:org` | `read:org` is needed to see org sponsorships. Must verify during build that tier amounts are returned. Fall back to `user` if not. Identity key: `databaseId`. |
| Open Collective | OAuth2 app | `orders incognito` (+ `email` optional) | Tokens last 90 days and there is no documented refresh. When the token expires we fall back to maintainer-side data. Identity key: account `id`. |
| Patreon | v2 client | `identity identity.memberships` | One shared client serves many maintainers, so it **must** request `identity.memberships`. The consent screen reads "all memberships". Always pass scopes explicitly and list `fields[...]`. |
| Email (Stripe) | Magic link | n/a | Single-use link, 15-minute expiry, rate limited per address and IP. |

Maintainers connect providers from the dashboard:

| Provider | Maintainer scopes / flow |
|---|---|
| GitHub Sponsors | `read:user read:org`. For an org listing, the maintainer must be an org admin. |
| Open Collective | `account webhooks orders` |
| Patreon | `campaigns campaigns.members w:campaigns.webhook` |
| Stripe | Connect onboarding (§8) |

## 6. Contribution data & freshness

### 6.1 Normalized shape (JSON, used by every SDK)

```jsonc
{
  "supporter": {
    "id": "sup_…",
    "identities": [
      { "provider": "github", "id": "583231", "handle": "alice" },
      { "provider": "patreon", "id": "12345", "handle": null }
    ]
  },
  "contributions": [
    {
      "id": "con_…",
      "provider": "github",                 // github | opencollective | patreon | stripe
      "identity": { "provider": "github", "id": "583231" },
      "kind": "recurring",                  // recurring | one_time
      "status": "active",                   // see status table
      "amount": { "value": 500, "currency": "USD" },   // minor units (cents)
      "interval": "month",                  // month | year | null (one_time)
      "tier": { "id": "ST_…", "name": "Coffee" },      // nullable
      "startedAt": "2026-03-01T10:00:00Z",
      "endedAt": null,
      "lastChargedAt": "2026-11-01T10:00:00Z",          // nullable where provider lacks it
      "nextChargeAt": "2026-12-01T10:00:00Z",           // nullable
      "totalContributed": { "value": 4500, "currency": "USD" }, // nullable
      "payments": [ { "amount": {…}, "status": "paid", "chargedAt": "…" } ] // where available
    }
  ],
  "fetchedAt": "2026-11-16T18:00:00Z",
  "stale": false            // true if a provider could not be refreshed (data is last known)
}
```

### 6.2 Status values

`active`, `pending_cancellation`, `cancelled`, `past_due`, `paid` (one-time completed), `refunded`, `failed`, `pending`.

Provider mapping:

| Provider | Raw value | Sponsorkit status |
|---|---|---|
| GitHub | `isActive` + `isOneTimePayment` + webhook `pending_cancellation` | `active` / `paid` / `pending_cancellation` / `cancelled` |
| Open Collective | `ACTIVE` | `active` |
| Open Collective | `PAID` | `paid` |
| Open Collective | `CANCELLED` | `cancelled` |
| Open Collective | `REFUNDED` | `refunded` |
| Open Collective | `ERROR`, `REJECTED` | `failed` |
| Open Collective | `PENDING`, `PROCESSING`, `NEW` | `pending` |
| Patreon (`patron_status`) | `active_patron` | `active` |
| Patreon | `declined_patron` | `past_due` |
| Patreon | `former_patron` | `cancelled` |
| Patreon | `null` | not a contribution |
| Stripe (subscription) | `active` | `active` |
| Stripe | `active` with `cancel_at` set | `pending_cancellation` |
| Stripe | `past_due` | `past_due` |
| Stripe | `canceled` | `cancelled` |

### 6.3 Where the data comes from

- **Webhooks first.**
  - Patreon: created automatically via the API, HMAC-MD5 verified.
  - Stripe: two endpoints (platform and Connect), signature verified.
  - GitHub Sponsors: the maintainer pastes our URL and secret into their Sponsors dashboard. There is no API to create the webhook; the dashboard shows step-by-step instructions and a "test delivery" status. HMAC-SHA256 verified.
  - Open Collective: created via the API. **Unsigned**, so the URL carries a random token, and every webhook only triggers a **re-fetch** of the order from the API.
- **End-user token refresh.** When `getFinancialContribution()` is called and cached data for that supporter is older than `maxAge` (default 1 h, max 24 h), the API re-queries the provider using the supporter's token.
  - GitHub: `viewer.sponsorshipsAsSponsor(activeOnly:false, maintainerLogins:[…])` plus org sponsorships.
  - Open Collective: `me.orders(filter:OUTGOING, oppositeAccount, includeIncognito:true)`.
  - Patreon: `/identity?include=memberships.campaign`.
- **Maintainer-side sync.** The scheduler re-syncs each connection's full sponsor list every 24 h, and immediately after connecting. Sources:
  - GitHub: `sponsorshipsAsMaintainer(includePrivate:true, activeOnly:false)` plus `sponsorsActivities`.
  - Open Collective: `orders(filter:INCOMING)`.
  - Patreon: members with `pledge_history`.
  - This catches missed webhooks and fills `payments` history.
- **Rate limits.** Provider limits are low: Patreon allows 100 requests per minute per token, Open Collective 100 per minute. The API serves from Postgres and refreshes at most once per `maxAge`. A refresh failure returns cached data with `stale: true`, never an error.

### 6.4 Privacy

- The maintainer dashboard lists supporters with handle, provider, amount and status, **unless**:
  1. the supporter set `visibility = private` in `/account`, or
  2. the provider marks the contribution private: a GitHub `PRIVATE` sponsorship, an Open Collective incognito order, or a masked Patreon identity.

  Private rows show as "Private supporter" with amounts only.
- The SDK always returns the **signed-in supporter's own** contributions to that project. That is what the supporter consented to.
- Server-side lookup by provider identity (§7.3) returns only data the maintainer could already see on the provider, so it never reveals private contributions.

## 7. Public HTTP API (`https://api.sponsorkit.io/v1`)

Everything is JSON with camelCase fields. Errors use `application/problem+json` with a stable `code`. Request IDs are returned in `Sponsorkit-Request-Id`.

### 7.1 Client API (public key + session token)

| Method & path | Purpose |
|---|---|
| `POST /auth/token` | Exchange `{code, codeVerifier}` or `{deviceCode}` for `{sessionToken, supporter}` |
| `POST /auth/device` | Start the device flow: returns `{deviceCode, userCode, verificationUri, verificationUriComplete, interval, expiresIn}` |
| `GET /me` | Supporter and linked identities |
| `GET /me/contributions?maxAge=3600` | Normalized contribution data (§6.1) for this project |
| `DELETE /me/session` | Sign out (revoke the token) |
| `GET /projects/{pk}/checkout` | Public checkout config: providers, currencies, presets, allowed frequencies, minimum |
| `POST /checkout/sessions` | Create a hosted checkout. Body: `{amount?, currency?, frequency?, allowedFrequencies?, allowCustomAmount?, providers?, returnTo?}`. Returns `{id, url}`. Options are clamped to the project's config. |
| `GET /checkout/sessions/{id}` | Status: `open` / `completed` / `returned` / `expired`. The SDK polls this after the popup closes. |

### 7.2 Hosted pages (web)

| Path | Purpose |
|---|---|
| `/connect` | Supporter sign-in and linking (§5) |
| `/device` | Enter a device code |
| `/checkout/{sessionId}` | The checkout flow (§8.1) |
| `/account` | Supporter self-service: linked identities, visibility, Stripe subscriptions via the Stripe customer portal, active sessions |

### 7.3 Server API (secret key, `Authorization: Bearer sk_…`)

| Method & path | Purpose |
|---|---|
| `POST /sessions/introspect` | `{sessionToken}` → `{active, supporter, projectId}`. Lets a SaaS backend trust a token its frontend got from the SDK. |
| `GET /supporters/{id}/contributions` | Same shape as `/me/contributions` |
| `GET /contributions?provider=github&handle=alice` (or `&providerUserId=`, or `&email=` for Stripe) | Look up by provider identity without a session, limited to maintainer-visible data |
| `GET /contributions?status=active&cursor=…` | List and paginate all contributions for the project |

### 7.4 Dashboard API (maintainer cookie on `.sponsorkit.io`)

This API is internal to the web app and is not a public contract. It covers:

- GitHub sign-in for maintainers
- Projects: CRUD, allowed origins, checkout config
- Keys: rotate public keys, create and revoke secret keys
- Provider connections: connect and disconnect, webhook setup status
- Supporter list with CSV export
- Outbound webhook endpoints, plus a delivery log with redeliver

### 7.5 Outbound webhooks (to maintainers)

**Events:**

- `contribution.created`
- `contribution.updated` (amount, tier or status changed)
- `contribution.cancelled`
- `contribution.payment_succeeded`
- `contribution.payment_failed`
- `contribution.refunded`
- `supporter.linked` (a new identity was linked to a supporter who has contributions to this project)

**Payload:** `{id, type, createdAt, projectId, data: {supporter, contribution}}`. The `contribution` object uses the §6.1 shape.

**Signature:** `Sponsorkit-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<rawBody>")>`. Each SDK's server entry point ships a verifier with a 5-minute tolerance.

**Delivery:**

- Events go through the outbox table, at-least-once.
- Retries back off exponentially: 1 min, 5 min, 30 min, 2 h, 6 h, then every 12 h, for up to 3 days.
- An endpoint is auto-disabled after 3 days of failures, and the maintainer is emailed.

## 8. Checkout

### 8.1 Hosted flow (`sponsorkit.io/checkout/{id}`)

The SDK calls `openCheckout(opts)`. This creates a checkout session and opens the URL: in a popup in browsers, or in the system browser for CLIs and desktop apps. The page then runs these steps:

1. **Amount.** Preset buttons plus a custom amount if allowed. The `amount` option preselects a value; with `lockAmount` it cannot be changed. Amounts are clamped to the minimum.
2. **Frequency.** One-time, monthly or yearly, limited to `allowedFrequencies` and to what the chosen provider supports.
3. **Provider.** Only providers that can satisfy the selection are enabled. For example, Patreon is disabled for one-time payments, and GitHub Sponsors only offers yearly if a matching tier exists. Each provider shows a short reason when it is disabled.
4. **Identify.** The supporter signs in with the chosen provider, or by email for Stripe, so the payment can be attributed. If the checkout was opened from a signed-in SDK session, that identity is linked automatically.
5. **Pay.**
   - **Stripe:** a Checkout Session on the **platform** with `price_data` (exact amount; `recurring` for subscriptions), `payment_intent_data` / `subscription_data` `transfer_data.destination = acct_X`, and `on_behalf_of = acct_X`, so the maintainer is merchant of record. `client_reference_id` is the supporter ID. The Customer is reused per (supporter, connection).
   - **Open Collective:** redirect to `opencollective.com/{slug}/donate?amount=…&interval=month|year&redirect=…`.
   - **GitHub Sponsors:** redirect to the listing or the tier that best matches the amount (`github.com/sponsors/{login}/sponsorships?tier_id=…`). The exact URL parameters will be verified during the build.
   - **Patreon:** redirect to the tier checkout (`patreon.com/checkout/{vanity}?rid={tierId}`), using the cheapest tier at or above the amount.
6. **Return.**
   - Stripe: marks the session `completed` when its webhook confirms the payment.
   - Redirect providers: mark the session `returned` and trigger an immediate re-fetch of that supporter's contributions.
   - The page then `postMessage`s back to the opener, or shows "You can close this window".
   - `openCheckout()` resolves with `{status, contribution?}`.

### 8.2 Project checkout config (dashboard)

- Enabled providers, with display order
- Default currency (Stripe and Open Collective only; GitHub uses USD)
- Preset amounts, minimum amount, whether custom amounts are allowed
- Allowed frequencies
- Thank-you message and return URL

### 8.3 Stripe Connect specifics

- Connected accounts are created with **controller properties** equivalent to Express: Express dashboard, Stripe collects requirements, platform pays fees and carries losses. This replaces the legacy `type=express`, which Stripe now marks deprecated.
- Onboarding uses Account Links. Status is tracked via `account.updated`. The maintainer opens the Express dashboard through login links.
- **Webhooks:**
  - Platform endpoint: `checkout.session.completed`, `checkout.session.async_payment_*`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.*`, `charge.refunded`, `charge.dispute.*`.
  - Connect endpoint: `account.updated`, `account.application.deauthorized`.
- **Cancellation:** supporters cancel via the Stripe customer portal (`on_behalf_of` the maintainer), reached from `/account`.
- **Disconnect:** when a maintainer disconnects Stripe, Sponsorkit cancels that connection's subscriptions at period end and notifies the supporters.
- **Versions:** Stripe.net is pinned to its bundled API version (`2026-10-28.endive` at the time of writing).
- **Fees:** see decision **D1**.

## 9. SDKs

All SDKs share one behaviour contract. It is defined by `sdks/conformance/`: recorded HTTP fixtures plus scenarios such as sign-in via device code, cache hit, stale cache when offline, checkout completed, and webhook signature verification. Each SDK runs these scenarios in CI against a local fake server.

### 9.1 Client API (TypeScript shown; other languages follow idiomatic naming)

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({
  publicKey: "pk_live_…",
  cache: { maxAge: 3600 },          // seconds; offline fallback always on
  storage: undefined,               // default: localStorage (browser) / OS config dir (Node)
});

await sk.signIn();                  // popup | loopback | device code (auto); { provider: "github" } to skip the picker
sk.isSignedIn();                    // boolean (local check)

const fc = await sk.getFinancialContribution();          // { supporter, contributions, fetchedAt, stale, fromCache }
const fresh = await sk.getFinancialContribution({ maxAge: 0 });

const result = await sk.openCheckout({
  amount: 500, currency: "USD",
  frequency: "monthly", allowedFrequencies: ["monthly"],
  allowCustomAmount: true,
});                                 // { status: "completed" | "returned" | "cancelled", contribution? }

sk.accountUrl();                    // link for "manage my contribution"
await sk.signOut();
```

**Helpers.** These only filter. They never aggregate across providers or currencies.

- `fc.active()`: contributions with status `active` or `pending_cancellation`
- `fc.recurring()`, `fc.oneTime()`
- `fc.byProvider("github")`

The maintainer writes their own rule:

```ts
const supporting = fc.active().some(c => c.interval === "month" && c.amount.currency === "USD" && c.amount.value >= 500);
if (!supporting) showAd();
```

**Nag helper:**

```ts
const nag = sk.nag({ id: "my-cli", every: 10 /* runs */, orEvery: "7d" });
if (await nag.due(fc => fc.active().length === 0)) {
  console.log("❤️ Enjoying my-cli? Support it: " + await sk.checkoutUrl({ frequency: "monthly" }));
  nag.shown();
}
```

**Offline caching.** The session token and last result are stored per public key:

- Browser: `localStorage`.
- Node: `~/.config/sponsorkit/` on Linux, `~/Library/Application Support/sponsorkit/` on macOS, `%APPDATA%\sponsorkit\` on Windows.

When the network fails, `getFinancialContribution()` returns the cached result with `fromCache: true`, or an empty result if nothing is cached. **It never throws because the API is unreachable.** An app's main path must never break because Sponsorkit is down.

**Web components** (`@sponsorkit/sdk/elements`):

- `<sponsorkit-button public-key="pk_…" amount="500" frequency="monthly">`
- `<sponsorkit-badge>`: shows "Supporter" once signed in

They are framework-agnostic and theme via CSS custom properties.

**Server entry point** (`@sponsorkit/sdk/server`):

- `new SponsorkitServer({ secretKey })` with `introspect()`, `getContributions()`, `findContributions()`
- `webhooks.verify(rawBody, header)`

### 9.2 Per-language surface

| | JS/TS | .NET | Python | Go | Rust |
|---|---|---|---|---|---|
| Package | `@sponsorkit/sdk` | `Sponsorkit` | `sponsorkit` | `github.com/sponsorkit/sponsorkit.io/sdks/go` | `sponsorkit` |
| Get | `getFinancialContribution()` | `GetFinancialContributionAsync()` | `get_financial_contribution()` (+ `async` variant) | `GetFinancialContribution(ctx)` | `get_financial_contribution().await` |
| Sign in | popup / loopback / device | loopback / device | loopback / device | loopback / device | loopback / device |
| Checkout | popup / browser | system browser | system browser | system browser | system browser |
| UI extras | web components | – | – | – | – |
| Nag + offline cache | ✅ | ✅ | ✅ | ✅ | ✅ |
| Server client + webhook verify | ✅ | ✅ | ✅ | ✅ | ✅ |
| Runtime floor | Node 20+, evergreen browsers | netstandard2.0 + net8.0 | 3.10+ | Go 1.23+ | MSRV 1.85 |
| Dependencies | zero runtime deps | System.Text.Json only | `httpx` | stdlib only | `reqwest` (rustls), `serde`, `tokio` |

- **Libraries consuming the SDK** (e.g. a framework nagging its users) must not prompt for sign-in unexpectedly. `signIn()` is never called implicitly, and every SDK has a global `SPONSORKIT_DISABLE=1` kill switch for CI.
- **Testing:** each SDK accepts an `apiBaseUrl` override and a `test` mode keyed off `pk_test_`. In test mode, test-mode Stripe and the provider sandboxes are used where they exist.

## 10. Delivery plan (after approval)

All work lands in this PR as reviewable commits:

1. **API foundation:** .NET 10 solution, EF model and migrations, maintainer GitHub login, projects and keys, problem details, OpenAPI generation, Testcontainers tests.
2. **Supporter auth:** connect page, popup, loopback and device flows, magic link, identity linking and merging, sessions.
3. **Providers:** GitHub Sponsors, Open Collective, Patreon and Stripe Connect adapters. Each has OAuth, sync, webhooks and a WireMock-based test suite built from the documented payloads.
4. **Checkout:** hosted flow and Stripe Checkout Sessions.
5. **Outbound webhooks:** outbox, scheduler tick, retries, signature.
6. **Web:** landing page, docs, dashboard, hosted pages. Playwright e2e against the API with fake providers.
7. **SDKs:** JS/TS first (reference), then .NET, Python, Go and Rust, plus the conformance suite.
8. **CI/CD:** GitHub Actions. Build and test per component. Deploy the API to Cloud Run and the web app to its host. Trusted publishing to npm, NuGet, PyPI and crates.io; Go via tags `sdks/go/vX.Y.Z`.

**Definition of done:** everything builds, and all tests pass with fake providers. Going live needs only the credentials in §12.

## 11. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| **D1** | **Stripe processing fees.** With destination charges (needed for Express), Stripe bills **the platform** (you) for processing fees. A "0% fee" therefore costs Sponsorkit roughly 3% of every Stripe payment. | Add a **"cover processing fees" checkbox, on by default**, that grosses up the amount. Sponsorkit also takes an `application_fee` equal only to Stripe's fee, so it breaks even. |
| **D2** | **Web hosting.** Vercel Hobby is "personal or non-commercial use" only. A site that routes payments is likely commercial. | **Cloudflare Workers via OpenNext** (free, no such clause, supports Next 16). Alternatively, Vercel Hobby now and Pro ($20/mo) later. |
| **D3** | **Patreon consent scope.** We must request `identity.memberships`, so the user sees "read all your memberships". | Accept it. We store only memberships to campaigns connected to Sponsorkit and discard the rest. |
| **D4** | **Package naming.** `@sponsorkit` npm scope, `Sponsorkit` NuGet prefix, `sponsorkit` on PyPI and crates.io. Availability is unverified. | Reserve them now. Fall back to `sponsorkit-sdk` where taken. |

## 12. What you will need to provide to go live

1. **GitHub OAuth App** (device flow enabled), for maintainer login, supporter login and Sponsors connection: client ID and secret.
2. **Open Collective OAuth app:** client ID and secret.
3. **Patreon v2 client:** client ID and secret.
4. **Stripe platform account** with Connect enabled and the platform profile and branding completed: secret key, plus two webhook secrets.
5. **Google Cloud project:** Cloud Run, Cloud Scheduler, Secret Manager and Artifact Registry, with a GitHub Actions Workload Identity Federation binding.
6. **Neon project:** pooled and direct connection strings.
7. **Web host account** (D2) and DNS for `sponsorkit.io` and `api.sponsorkit.io`.
8. **Transactional email** for magic links (e.g. Resend's free tier): API key.
9. **Package registry** trusted-publisher configurations.
