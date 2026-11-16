# Sponsorkit: product & technical specification

> Status: **DRAFT v7, awaiting approval.** Nothing below is built yet.
> Last updated: 2026-11-16.
>
> **What changed in v7:** this version cuts the setup down to nothing.
> - **No accounts or keys.** The SDK takes the maintainer's GitHub and/or Open Collective handle directly. There is no dashboard, project, public key or allowed-origins list.
> - **No secret keys.** A backend verifies a user by forwarding that user's session token.
> - **Test mode is an SDK `mock` option.**
> - **No global supporter accounts.** A session simply holds the identities that signed in through it.
> - **Checkout is stateless.**

## 1. What Sponsorkit is

Sponsorkit lets an open source maintainer build financial contributions directly into their software, **with no account and no setup**.

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "mathiaslorenzen", opencollective: "sponsorkit" });

const fc = await sk.getFinancialContribution();
if (fc.signedIn && !fc.active().some(c => c.amount.currency === "USD" && c.amount.value >= 500)) showAd();

button.onclick = () => sk.openCheckout({ frequency: "monthly", amount: 500 });
```

That's the whole integration: install the package, name the account(s) you receive sponsorships on, and write your rule.

Sponsorkit:

1. tells the app what the current user has contributed to those accounts (`getFinancialContribution()`), and
2. sends the user to contribute (`openCheckout()`).

**The maintainer writes the rules.** Show an ad under $5/month, nag every N runs, unlock a feature: Sponsorkit only reports facts.

### 1.1 Providers (v1)

| Provider | Maintainer passes | Recurring | One-time | Custom amount | Currency |
|---|---|---|---|---|---|
| GitHub Sponsors | `github: "<user or org login>"` | monthly | ✅ | Tier-based (custom-amount tiers if enabled on the listing) | USD |
| Open Collective | `opencollective: "<collective slug>"` | monthly, yearly | ✅ | ✅ | The collective's currency |

Patreon and other providers are deferred (D3) and will be added through the same adapter interface.

### 1.2 Design principles

- **Zero setup.** There is no Sponsorkit account, dashboard, API key, callback URL or webhook for the maintainer to configure.
- **On demand.** When an app asks, Sponsorkit queries the provider with the **supporter's own sign-in token** and caches the answer. There are no webhooks and no background sync.
- **Facts, not policy.** Contributions are returned per provider as raw data. Sponsorkit never aggregates, converts currencies, or decides who "counts".
- **Never break the host app.** SDKs never throw because Sponsorkit or a provider is down (§7.2).
- **Never handle money.** Supporters pay on GitHub Sponsors or Open Collective.

### 1.3 Non-goals (v1)

- Webhooks of any kind.
- A maintainer dashboard or supporter list. GitHub and Open Collective already show maintainers their supporters.
- Accounts, projects or keys.
- Payment processing.
- Tamper-proofing client-side checks. The software is open source; backends that need a trustworthy answer use §6.4.
- Bountyhunt. It has been removed entirely.

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **Target** | An account the maintainer receives sponsorships on: `github:<login>` or `opencollective:<slug>`. An SDK instance is configured with one or more targets, called its **target set**. |
| **Supporter** | The end-user of the software who signs in. |
| **Identity** | A supporter's provider account, either GitHub or Open Collective. It is stored once per provider account, with its encrypted provider token. |
| **Session** | What the SDK holds after sign-in: an opaque token (`sks_…`). It is bound to **one target set** and holds the one or two identities the supporter signed in with. |
| **Contribution** | A sponsorship (GitHub) or order (Open Collective) from a sponsor entity to a target, normalized into the shape in §5.1. |
| **Sponsor entity** | Who pays: the user, or an organization the user belongs to (§5.5). |

## 3. Architecture

```
                         sponsorkit.io  (one Cloudflare Worker, free plan)
                 ┌───────────────────────────────────────────────────────────┐
 Supporter ────▶ │ static (Next.js export): /, /docs, /connect, /device,      │
 (browser)       │   /checkout          ← free, no Worker CPU                 │
 SDK in app ───▶ │ /api/v1/*      public API (Hono)                          │
 Your backend ─▶ │ /api/oauth/*   provider OAuth start/callback               │
 (forwards sks_) │ cron (daily)   delete expired rows                        │
                 └──────┬──────────────────────────────┬─────────────────────┘
                        │ Neon serverless driver (HTTP) │ fetch, on demand, cached
                        ▼                               ▼
                  Neon Postgres (free)       GitHub GraphQL · Open Collective GraphQL
```

- **Runtime.**
  - TypeScript on **Cloudflare Workers**, using the **Hono** framework. Hono also runs on Node and Bun, so the service can be self-hosted.
  - Bun is used for local development, scripts and tests.
- **Web.** A Next.js static export. It contains:
  - the landing page;
  - the docs (MDX);
  - three client-rendered supporter pages: `/connect`, `/device` and `/checkout`.

  The Worker serves these as static assets. Asset requests don't invoke the Worker, so they don't count against the request limit.
- **Database.** Neon Postgres (free tier), reached through the Neon serverless HTTP driver, with Drizzle for the ORM and migrations. Each request makes at most about 5 queries.
- **Secrets.** Stored as Wrangler secrets.
  - Provider tokens are encrypted with AES-256-GCM via Web Crypto. Each ciphertext records its key version, and the row ID is used as associated data (AAD).
  - Session tokens and codes are stored only as SHA-256 hashes.
- **Background work.** Just one daily cron trigger, which deletes expired rows.
- **Rate limiting.** The Workers Rate Limiting binding, applied per IP, per session and per target. One free WAF rate-limit rule on `/api/v1/auth/*` acts as a backstop. *To verify:* that the binding is available on the free plan.

### 3.1 Free-plan budget

| Workers Free limit | How Sponsorkit fits |
|---|---|
| 100k requests/day | Static assets don't count against this. SDKs cache locally, so each user makes about 1 call per hour at most. |
| 10 ms CPU per request | Handlers are I/O-bound, and waiting on network calls doesn't count as CPU. There is no server-side rendering. |
| 50 subrequests per request | One refresh is at most 5 DB queries plus 1 GitHub GraphQL call (orgs batched with aliases) plus 1–2 Open Collective calls. |
| 5 cron triggers | Sponsorkit uses 1. |

If usage outgrows the free plan, Workers Paid costs $5/mo. Switching is a plan change only; no code changes.

### 3.2 Repository layout (Bun workspaces)

```
app/                     Cloudflare Worker: Hono API, OAuth, static assets binding, cron
  src/{api,oauth,providers/{github,opencollective},db}
  test/                  Vitest; Postgres service container; provider APIs faked with MSW
web/                     Next.js static export (landing, docs, /connect, /device, /checkout) + Playwright e2e
packages/shared/         Zod schemas & types (app, web, JS SDK); generates OpenAPI
sdks/{js,dotnet,python,go,rust}/
sdks/conformance/        fake API + fixtures + scenarios every SDK must pass
openapi/sponsorkit.v1.yaml
docs/                    this spec
.github/workflows/       CI, Worker deploy, trusted publishing
```

## 4. Data model (Postgres)

| Table | Columns |
|---|---|
| `identities` | `id`, `provider` (`github`/`opencollective`), `external_user_id` (immutable: GitHub `databaseId`, OC account `id`), `handle`, `token_enc`, `token_key_version`, `expires_at`, `token_status` (`ok`/`expired`/`revoked`), `orgs jsonb`, `orgs_fetched_at`; **unique(provider, external_user_id)** |
| `sessions` | `id`, `token_hash`, `targets jsonb` (sorted), `targets_hash`, `client_kind` (`browser`/`loopback`/`device`), `app_name?`, `origin?`, `created_at`, `last_used_at`, `expires_at` |
| `session_identities` | `session_id`, `identity_id` |
| `auth_requests` | `id`, `kind` (`connect`/`device`), `code_hash`, `user_code?`, `pkce_challenge`, `targets jsonb`, `delivery` (`web_message`/`redirect`/`loopback`/`device`), `origin?`, `redirect_uri?`, `session_id?` (when adding a second identity), `continue_to?` (checkout), `attempts`, `expires_at`, `consumed_at` |
| `oauth_states` | `state_hash`, `browser_nonce_hash`, `auth_request_id`, `pkce_verifier_enc`, `expires_at` |
| `contribution_cache` | `identity_id`, `target` (`github:x` / `opencollective:y`), `contributions jsonb`, `fetched_at`, `error?`; **pk(identity_id, target)** |
| `target_cache` | `target`, `display_name`, `avatar_url`, `exists`, `currency`, `tiers jsonb`, `fetched_at` |

- **Identities are shared across sessions.** A supporter who signs in to two apps gets one identity row, holding their latest provider token. This matters because GitHub keeps at most 10 tokens per user, app and scope; signing in an 11th time revokes the oldest.
- **There is no "supporter account".** A supporter is simply whoever holds a session.

## 5. Contribution data

### 5.1 Result shape (JSON; identical in every SDK)

```jsonc
{
  "signedIn": true,
  "disabled": false,
  "mock": false,
  "targets": ["github:mathiaslorenzen", "opencollective:sponsorkit"],
  "supporter": {
    "id": "sup_…",                          // pairwise: stable per (target set, sign-in identity) (§5.4)
    "identities": [ { "provider": "github", "id": "583231", "handle": "alice", "needsReconnect": false } ]
  },
  "contributions": [
    {
      "id": "con_github_…",                 // stable, derived from provider + external id
      "provider": "github",                 // github | opencollective
      "target": "github:mathiaslorenzen",
      "sponsor": { "type": "user", "provider": "github", "id": "583231", "handle": "alice" },
      "via": "direct",                      // direct | organization
      "kind": "recurring",                  // recurring | one_time
      "frequency": "monthly",               // one_time | monthly | yearly
      "status": "active",                   // §5.2
      "amount": { "value": 500, "currency": "USD" },   // minor units
      "tier": { "id": "ST_…", "name": "Coffee" },      // nullable
      "flags": [],                          // via_patreon (GitHub sponsorship paid through Patreon)
      "private": false,                     // provider marks it private/incognito
      "startedAt": "2026-03-01T10:00:00Z",
      "endedAt": null,
      "lastChargedAt": null,                // OC only
      "nextChargeAt": null,                 // OC only
      "totalContributed": null              // OC only: { value, currency }
    }
  ],
  "fetchedAt": "2026-11-16T18:00:00Z",
  "stale": false,
  "fromCache": false
}
```

When the supporter is signed out, disabled or mocked, `signedIn`, `disabled` and `mock` are set accordingly, and `supporter` and `contributions` are `null` / `[]` unless mock data was supplied.

### 5.2 Status values & mapping

**Status values:**

- `active`
- `paused`
- `cancelled`
- `paid` (a completed one-time contribution)
- `refunded`
- `disputed`
- `failed`
- `pending`

`active()` returns contributions with status `active`. Unknown provider values map to `pending` and are logged.

**GitHub:**

| GitHub data | Status |
|---|---|
| `isOneTimePayment=true` | `paid` |
| Recurring, `isActive=true` | `active` |
| Recurring, `isActive=false` | `cancelled` |

GitHub only reports pending cancellations through webhooks, so a sponsorship stays `active` until it actually ends. A sponsorship paid through Patreon (`paymentSource=PATREON`) gets the `via_patreon` flag.

**Open Collective:**

| Order status | Status |
|---|---|
| `ACTIVE` | `active` |
| `PAID` | `paid` |
| `PAUSED` | `paused` |
| `CANCELLED`, `EXPIRED` | `cancelled` |
| `REFUNDED` | `refunded` |
| `DISPUTED` | `disputed` |
| `ERROR`, `REJECTED` | `failed` |
| `NEW`, `PENDING`, `PROCESSING`, `REQUIRE_CLIENT_CONFIRMATION`, `IN_REVIEW` | `pending` |

Status always comes from the order, never from membership: an OC `memberOf` / `BACKER` relationship survives cancellation.

### 5.3 How data is fetched (`GET /api/v1/contributions`)

For each (session identity × session target of the same provider):

1. **Cache check.** If the `contribution_cache` row is younger than `freshness`, use it. `freshness` defaults to 1 h; the minimum is 60 s and the maximum 24 h.
2. **Live query.** Otherwise, query the provider live with the identity's token, then replace the cache row:
   - **GitHub:** a single GraphQL request.
     - `viewer { sponsorshipsAsSponsor(activeOnly:false, maintainerLogins:[…]) }`
     - Plus one aliased `organization(login){ sponsorshipsAsSponsor(maintainerLogins:[…]) }` per org the viewer belongs to. The org list comes from `viewer.organizations` and is cached for 24 h on the identity.
   - **Open Collective:** `me { orders(filter:OUTGOING, oppositeAccount:{slug}, includeIncognito:true) }`, plus the same query for collectives the user administers (`memberOf(role:ADMIN)`).
3. **On failure** (provider down, or token expired/revoked): serve the last cached row and set `stale: true`. An expired Open Collective token also sets `needsReconnect: true` on that identity. Provider failures never become API errors.
4. **Rate limits.**
   - Provider calls for one result run in parallel.
   - Each (identity, target) pair is refreshed at most once per 60 s.
   - Provider quotas are per token: GitHub allows 5,000 requests/h and Open Collective 100/min, so normal use stays far below them.

### 5.4 Privacy & consent

- **Consent screen.** It shows exactly which targets will be checked, using their verified avatar and name from the provider:

  > *"An app wants to know whether you sponsor **@mathiaslorenzen** on GitHub and **Sponsorkit** on Open Collective. It will see the amount, frequency and status of those contributions only, including private ones. Nothing else about your account is shared."*

- **Who is asking.**
  - Web: the requesting site's origin, taken from the browser rather than claimed by the SDK.
  - Native: the SDK-supplied `appName`, labelled *"says it is"*.
- **Target binding.** A session is bound to its target set. The API returns contributions for those targets only. A different target set requires a new sign-in and new consent.
- **Identity disclosure.** `supporter.identities` lists only the identities signed in through this session.
- **Pairwise supporter ID.** `supporter.id` is `sup_` + base32(HMAC(server_key, targets_hash ‖ provider ‖ external_user_id)). It is stable for the same person and the same target set, so a backend can key users on it. Apps with different target sets cannot correlate users.
- **What Sponsorkit does not store.** Sponsorkit stores nothing about a supporter except their identity, provider token, org list and cached contributions to targets that apps actually asked about.

### 5.5 Organization sponsorships

If a GitHub org (or an OC organization or collective the user administers) sponsors a target, the contribution is **always returned** to its members. It is marked `via: "organization"` with `sponsor.type: "organization"`, and the developer decides whether it counts.

`fc.direct()` filters these out. Private org sponsorships may only be visible to org admins.

### 5.6 Targets metadata (`GET /api/v1/targets?github=…&opencollective=…`)

This endpoint is public and cached for 1 h. For each target it returns `exists`, display name, avatar, currency and tiers (id, name, amount, frequency, URL).

It feeds three things:

- the consent screen;
- the checkout chooser;
- the SDK's development-time warnings, e.g. "github:foo has no Sponsors listing".

Data is fetched with Sponsorkit's own app token (GitHub) or anonymously (Open Collective).

## 6. Authentication

Sponsorkit acts as an OAuth-style authorization server for the SDKs. Provider OAuth runs only on the server, so SDKs never see provider tokens.

### 6.1 Rules

- **PKCE (S256) everywhere.**
  - Codes are single-use and expire in 60 s.
  - Each code is bound to the PKCE challenge, the target set, and the delivery target, and these are re-checked at `POST /api/v1/auth/token`.
  - A stolen code is useless without the verifier, which only the initiating SDK holds.
- **Delivery targets.** Because there are no registered origins, delivery is constrained by mechanism instead:
  - `web_message`: the `/connect` page posts the code only to `window.opener`, with `targetOrigin` set to the origin the SDK passed. The browser enforces that the opener really has that origin. That origin is shown on the consent screen.
  - `redirect`: used when popups are blocked. Only an `https` (or localhost) `redirect_uri` is accepted, and the consent screen shows *"You'll return to ‹host›"*.
  - `loopback`: only `http://127.0.0.1:{port}/callback` or `http://[::1]:{port}/callback` (RFC 8252 §7.3).
- **Provider OAuth `state`.**
  - Random, single-use, expires after 10 min.
  - Bound to the browser through a pre-auth cookie nonce (`__Host-` cookie, HttpOnly, Secure, SameSite=Lax).
  - Rejected on any mismatch.

### 6.2 Flows

| Host | Flow |
|---|---|
| Browser | `signIn()` must be called from a click handler. It opens a popup **synchronously** to `/connect?targets=…&challenge=…&delivery=web_message&origin=…`. The user picks a provider, sees the consent screen, completes provider OAuth, and the code is posted back. If the popup is blocked, the SDK uses `delivery=redirect` when `returnTo` is set, and otherwise rejects with `popup_blocked`. |
| CLI / desktop with a browser | **Loopback.** The SDK listens on `127.0.0.1:{random}/callback` and opens the system browser. |
| Headless / SSH / container | **Device code** (RFC 8628). The SDK prints a `userCode` and `sponsorkit.io/device`, then polls `POST /auth/token`, honouring `interval` and `slow_down`. See the device-code details below. |
| Auto-pick | Native SDKs try loopback first. They fall back to device code when there is no display, when `SSH_CONNECTION` is set, or when the browser fails to open. |

Device-code details:

- The `userCode` is 8 characters from a 20-letter alphabet (about 34 bits), valid for 10 minutes.
- After 5 wrong attempts, per IP or per code, the code is invalidated.
- The `/device` page shows the targets, the `appName`, and when the code was requested.

**Adding a second identity.** `signIn({ provider: "opencollective" })` with an existing session adds that identity to the same session. The session ID is carried in the auth request, so the session token itself never appears in a URL.

### 6.3 Provider OAuth

| Provider | Scopes | Token |
|---|---|---|
| GitHub (one OAuth App, device flow enabled) | `read:user read:org` | Does not expire. Identity key is `databaseId`. *To verify:* whether these scopes return tier amounts. If not, request `user` and disclose it on the consent screen (D6). |
| Open Collective (OAuth2 app) | `orders incognito` | Expires after 90 days, with no refresh. The identity then becomes `expired`, results are served stale with `needsReconnect`, and the SDK's `signIn({ provider: "opencollective" })` reconnects it. |

### 6.4 Sessions & backend verification

- **Session token.** `sks_` plus 32 random bytes. It expires 180 days after last use; device-flow sessions expire after 30 days idle.
- **Ending a session.** `signOut()` revokes it. Supporters can also revoke Sponsorkit's access at GitHub or Open Collective; their identity then becomes `revoked`.
- **Backend verification.** A backend never needs a key.
  1. The frontend sends its session token to the backend.
  2. The backend calls `GET /api/v1/contributions` with `Authorization: Bearer sks_…`.
  3. The backend checks that the returned `targets` equal its own.

  Each SDK's server helper does all three steps:

  ```ts
  import { verifySession } from "@sponsorkit/sdk/server";
  const fc = await verifySession(token, { github: "mathiaslorenzen" }); // throws if targets differ or session invalid
  ```

## 7. SDKs

### 7.1 Client API (TypeScript; other languages use idiomatic names, §7.8)

```ts
const sk = new Sponsorkit({
  github: "mathiaslorenzen",          // at least one target
  opencollective: "sponsorkit",
  appName: "my-cli",                  // shown on consent/device pages for native apps
  cacheTtl: 3600,                     // seconds served from local cache without calling the API
  freshness: 3600,                    // max age of provider data the API may return (min 60)
  mock: undefined,                    // §7.4
  storage: undefined,                 // default: localStorage / per-user config dir
  apiBaseUrl: undefined,              // self-hosting / tests
});

await sk.signIn();                     // provider picker; { provider } to skip it
sk.isSignedIn();
const fc = await sk.getFinancialContribution({ cacheTtl?, freshness? });
const r = await sk.openCheckout({ provider?, amount?, currency?, frequency?, timeout?, signal? });
sk.checkoutUrl({ amount?, frequency? });   // sync, offline-safe link to /checkout (no sign-in)
await sk.signOut();
```

**Helpers on the result.** These only filter; they never sum across providers or currencies.

- `fc.active()`
- `fc.recurring()`
- `fc.oneTime()`
- `fc.byProvider(p)`
- `fc.direct()`

### 7.2 Error contract (identical in every SDK; enforced by the conformance suite)

| Situation | Behaviour |
|---|---|
| No targets, malformed target, or (dev-time) a target that doesn't exist | **Throws** `SponsorkitError{code: "invalid_config"}`. The existence check uses `/targets` once per process, and only outside production builds where the language supports detecting that. |
| Not signed in | Returns the signed-out result. No network call. |
| Session revoked or expired | Clears the token and cache, then returns the signed-out result. |
| Network error, 5xx, rate-limited | Returns the cache (`fromCache:true, stale:true`). If nothing is cached, returns a signed-in empty result with `stale:true`. Honours `Retry-After`. **Never throws.** |
| `SPONSORKIT_DISABLE=1` | No network or disk access. Returns `disabled:true`. `nag.due()` returns false. `signIn` and `openCheckout` reject with `disabled`. |
| Popup blocked | `signIn` and `openCheckout` reject with `popup_blocked`, unless the redirect fallback applies. |

### 7.3 Checkout (stateless)

`openCheckout(opts)`:

1. **Sign in first if needed.** This way the new contribution can be found afterwards.
   - In browsers this all happens in **one** popup, opened synchronously: `/checkout?targets=…&amount=…&frequency=…&challenge=…&origin=…`. That page runs the connect flow if needed, posts the code back, and then continues.
   - Loopback: the local callback redirects onward.
   - Device: the `/device` page continues after sign-in.
2. **Choose a provider** (the static `/checkout` page, using `/targets`).
   - If one provider fits, go there directly. If both fit, the page shows a small chooser.
   - **Eligibility rules.**
     - **Currency:** must match exactly. GitHub is USD; Open Collective uses the collective's currency.
     - **Frequency:** GitHub supports monthly and one-time; Open Collective supports all frequencies.
     - **GitHub tier:** the cheapest tier at or above the amount, otherwise the highest tier. A listing with no tiers is disabled.
   - Each disabled option shows the reason.
3. **Redirect to the provider.**
   - GitHub: the chosen tier on `github.com/sponsors/{login}`.
   - Open Collective: `opencollective.com/{slug}/donate?amount=…&interval=…&redirect=…`.
   - *To verify:* GitHub's tier and frequency URL parameters.
4. **Detect the result.** Sponsorkit can't see the payment, so the SDK re-checks:
   - Browser: once the popup closes. Native: right away.
   - It polls `getFinancialContribution({ cacheTtl: 0, freshness: 60 })` every 60 s, until a new or changed contribution appears, or until `timeout` (default 10 min) or `signal` fires.
   - It resolves `{ status: "contributed", contribution }` or `{ status: "unknown" }`. The latter is normal, because a payment can take a few minutes to appear at the provider.

`checkoutUrl()` returns the same `/checkout` page without a PKCE challenge. It is offline-safe, has no sign-in coupling, and suits nags and READMEs.

### 7.4 Mock mode (replaces server test mode)

```ts
new Sponsorkit({ github: "x", mock: "active-monthly" });        // presets: signed-out | none | active-monthly | one-time | cancelled | org
new Sponsorkit({ github: "x", mock: { contributions: [ /* §5.1 items */ ] } });
SPONSORKIT_MOCK=active-monthly                                   // env var, same presets
```

- No network or disk access. `mock: true` is set on the result.
- `signIn()` and `openCheckout()` resolve immediately; `openCheckout` simulates a new contribution.
- Used by the docs, the conformance suite, and maintainers' own tests.

### 7.5 Nag helper

```ts
const nag = sk.nag({ id: "my-cli", every: 10, orEvery: "P7D" });
if (await nag.due(fc => fc.active().length === 0)) {
  console.error(`❤️ Enjoying my-cli? Support it: ${sk.checkoutUrl({ frequency: "monthly" })}`);
  nag.shown();
}
```

- **Run counter.** Incremented once per process per `id`, the first time `due()` is called.
- **When `due()` is true.** When `predicate && (runs >= every || since(lastShown) >= orEvery)`. `shown()` resets both.
- **Durations.** ISO-8601 strings or the language's native duration type.
- **When `due()` returns false.** Under `SPONSORKIT_DISABLE`, `SPONSORKIT_NO_NAG` or `CI`, or when stdout or stderr is not a TTY. `{ force: true }` overrides this; libraries should not use it.
- `signIn()` is never called implicitly.

### 7.6 Local storage

- **Location.**
  - Browsers: `localStorage`.
  - Linux: `$XDG_CONFIG_HOME/sponsorkit`.
  - macOS: `~/Library/Application Support/sponsorkit`.
  - Windows: `%APPDATA%\sponsorkit`.
- **Permissions.** Directories `0700`, files `0600` (user-only ACL on Windows).
- **Contents.** The token, cache and nag state are keyed by `targets_hash`.
- **Writes.** Atomic: write a temp file, then rename it.
- **Keychain.** Optional OS keychain storage for the token.
- **Clearing.** `signOut()` and session revocation clear both the token and the cache.

### 7.7 Web components & server helper

- **`@sponsorkit/sdk/elements`.** `<sponsorkit-button github="…" opencollective="…" amount frequency>` opens checkout synchronously. `<sponsorkit-badge>` shows "Supporter ♥" when `active()` is non-empty.
- **`@sponsorkit/sdk/server`.** `verifySession(token, targets)` (§6.4). Every SDK has an equivalent.

### 7.8 Per-language surface

| | JS/TS | .NET | Python | Go | Rust |
|---|---|---|---|---|---|
| Package | `@sponsorkit/sdk` | `Sponsorkit` | `sponsorkit` | `github.com/sponsorkit/sponsorkit.io/sdks/go` | `sponsorkit` |
| Get | `getFinancialContribution()` | `GetFinancialContributionAsync(ct)` | `get_financial_contribution()` / `aget_…` | `GetFinancialContribution(ctx)` | `get_financial_contribution().await` |
| Sign in | popup, redirect, loopback, device | loopback, device | loopback, device | loopback, device | loopback, device |
| UI elements | ✅ | – | – | – | – |
| Checkout, nag, cache, mock, error contract, `verifySession` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Runtime floor | Node 20+, Bun, Deno, evergreen browsers | netstandard2.0 / net8.0 | 3.10+ | Go 1.23+ | MSRV 1.85 |
| Runtime deps | none | System.Text.Json (netstandard only) | `httpx` | stdlib | `reqwest` (rustls), `serde`, `tokio` |

All five SDKs ship together in v1.

### 7.9 Conformance suite

`sdks/conformance/` contains a fake API and fixtures. Every SDK must pass every scenario:

**Configuration and modes**
- invalid configuration
- disabled
- mock presets

**Sign-in and session**
- signed out
- loopback sign-in
- device sign-in
- add a second identity
- session revoked

**Cache and network**
- cache hit
- offline with cache
- offline without cache
- rate-limited with `Retry-After`

**Checkout**
- checkout detects a new contribution
- checkout times out (`unknown`)
- checkout cancelled

**Local state and server helper**
- nag counting
- file permissions
- concurrent writes
- `verifySession` with matching targets
- `verifySession` with mismatched targets

## 8. HTTP API (`https://sponsorkit.io/api/v1`)

All requests and responses are JSON.

- **Errors** use `application/problem+json` with a stable `code`: `invalid_request`, `invalid_target`, `session_revoked`, `rate_limited` or `not_found`.
- **CORS:** any origin, without credentials.
- **Headers:** `Sponsorkit-Request-Id` on every response, `Retry-After` on `429`.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /targets?github=&opencollective=` | none | Target metadata (§5.6) |
| `POST /auth/device` | none | `{targets, codeChallenge, appName?, sessionToken?}` → `{deviceCode, userCode, verificationUri, verificationUriComplete, interval, expiresIn}` |
| `POST /auth/token` | none | Exchanges `{code, codeVerifier}` or `{deviceCode, codeVerifier}` for `{sessionToken, expiresAt, result}` |
| `GET /contributions?freshness=` | session | The §5.1 result for the session's targets |
| `DELETE /session` | session | Sign out |

Browser OAuth runs through the static pages plus `/api/oauth/{provider}/start` and `/api/oauth/{provider}/callback`.

Rate limits (starting values):

| Endpoint | Limit |
|---|---|
| `/auth/*` | 30/min per IP |
| Device-code entry | 5 attempts per code |
| `/contributions` | 60/min per session |
| `/targets` | 120/min per IP |

## 9. Operations

- **Logs:** Workers Logs, structured JSON.
- **Deploy:** GitHub Actions runs Drizzle migrations against Neon's direct endpoint, then `wrangler deploy`. Previews use Workers versions and a Neon branch.
- **Status:** `GET /api/v1/health` reports database reachability and each provider's last error rate.

## 10. Delivery plan (after approval)

All of this lands in this PR as reviewable commits:

1. **Foundation:**
   - Bun workspaces, the Hono Worker, the Drizzle schema, and Zod schemas with OpenAPI.
   - Rate limiting and Vitest.
2. **Auth:** connect, popup, redirect, loopback, device, second identity, sessions, pairwise IDs.
3. **Providers:**
   - GitHub and Open Collective adapters, each covering targets metadata, the live supporter query and normalization.
   - MSW suites built from documented responses.
4. **Checkout:** the `/checkout` page, provider eligibility and redirects.
5. **Web:** the landing page and docs, plus `/connect`, `/device` and `/checkout`. Playwright e2e tests run with providers faked.
6. **SDKs:** JS/TS (the reference), .NET, Python, Go and Rust, all passing the conformance suite.
7. **CI/CD:**
   - Per-component tests and Worker deploy.
   - Trusted publishing to npm, NuGet, PyPI and crates.io.
   - Go releases are tagged `sdks/go/vX.Y.Z`.

**Definition of done:**

- Everything builds and all tests pass.
- Going live needs only §13.
- Items in §11 are verified, or listed in the PR as unverified.

## 11. Trade-offs & verifications

### Accepted trade-offs

- **Freshness follows the cache.** A cancellation is noticed within `freshness` (default 1 h).
- **No pending cancellations on GitHub.** GitHub reports them only via webhooks, so a sponsorship shows as `active` until it actually ends.
- **Open Collective sign-ins expire after 90 days.** Supporters reconnect roughly once a quarter (`needsReconnect`).
- **Nothing is known about a supporter until they sign in through the app.**
- **No dashboard, analytics, verified app identity or revocable keys.** An optional "registered project" tier could add these later without breaking keyless SDKs.
- **Checkout can't confirm payment.** It detects a new contribution by re-checking, so it may report `unknown` even when the supporter did pay.

### To verify during the build

- **GitHub:**
  - the scope needed to read tier amounts and private sponsorships;
  - the URL parameters for tier and frequency;
  - reading tiers with an app token.
- **Open Collective:** whether `includeIncognito` works with a user token.
- **Cloudflare:** whether the Rate Limiting binding is available on the free plan.

## 12. Decisions

| # | Decision | Outcome |
|---|---|---|
| D1 | Stripe processing fees | Moot. Stripe was removed (D8). |
| D2 | Hosting | ✅ One Cloudflare Worker (free plan), TypeScript, static site. |
| D3 | Patreon | ✅ Deferred. Its shared-app consent would require reading all of a user's memberships. |
| D4 | Package names | ✅ `@sponsorkit/sdk`, `Sponsorkit`, `sponsorkit` (PyPI and crates.io), `github.com/sponsorkit/sponsorkit.io/sdks/go`. If a name is taken, fall back to `sponsorkit-sdk`. |
| D5 | Org sponsorships | ✅ Always included, marked `via: "organization"`. |
| D6 | GitHub scope | ✅ Start with `read:user read:org`. Switch to `user` only if amounts are missing, and disclose it on the consent screen. |
| D7 | Webhooks | ✅ None. Everything is fetched on demand. |
| D8 | Stripe Connect | ✅ Removed. Sponsorkit never processes payments. |
| D9 | Accounts and keys | ✅ None. The SDK takes target handles directly, and consent names those targets. |
| D10 | Server verification | ✅ Forward the supporter's session token. No secret keys. |
| D11 | Test mode | ✅ SDK `mock` option. No server test mode. |
| D12 | Supporter accounts | ✅ None. A session holds its identities. No merging and no `/account` page. |
| D13 | Checkout | ✅ Stateless. Sign in, redirect to the provider, then re-check. |
| D14 | SDK rollout | ✅ All five SDKs in v1. |

## 13. What you need to provide to go live

1. A **GitHub OAuth App** with device flow enabled: its client ID and secret.
2. An **Open Collective OAuth app**: its client ID and secret.
3. A free **Cloudflare account**: `sponsorkit.io` DNS on Cloudflare, plus an API token for deploys.
4. A **Neon project**: the pooled and direct connection strings.
5. **Trusted publishers** on npm, NuGet, PyPI and crates.io.
