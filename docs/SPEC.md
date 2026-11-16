# Sponsorkit: product & technical specification

> Status: **v8, implemented.** See §11 for what still has to be verified against the live providers.
> Last updated: 2026-11-16.
>
> **What changed in v8:** Sponsorkit is now a **single stateless Worker with no database**.
> - Session tokens are encrypted blobs. Each one carries the supporter's provider token(s) and the consented target set.
> - Contribution data is cached only in the SDK.
> - Headless sign-in uses a paste-back code instead of a server-side device flow.
>
> **v7** removed accounts, keys, server test mode, supporter accounts and checkout state.

## 1. What Sponsorkit is

Sponsorkit lets an open source maintainer build financial contributions directly into their software. The maintainer needs **no account and no setup**.

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "mathiaslorenzen", opencollective: "sponsorkit" });

const fc = await sk.getFinancialContribution();
if (fc.signedIn && !fc.active().some(c => c.amount.currency === "USD" && c.amount.value >= 500)) showAd();

button.onclick = () => sk.openCheckout({ frequency: "monthly", amount: 500 });
```

That is the whole integration. The maintainer installs the package, names the account(s) they receive sponsorships on, and writes their own rule. Sponsorkit does two things:

- reports what the current user has contributed to those accounts (`getFinancialContribution()`);
- sends the user to contribute (`openCheckout()`).

The maintainer decides what to do with that: show an ad below $5/month, nag every N runs, unlock a feature. Sponsorkit only reports facts.

### 1.1 Providers (v1)

| Provider | Maintainer passes | Recurring | One-time | Custom amount | Currency |
|---|---|---|---|---|---|
| GitHub Sponsors | `github: "<user or org login>"` | monthly | ✅ | Tier-based (custom-amount tiers if enabled on the listing) | USD |
| Open Collective | `opencollective: "<collective slug>"` | monthly, yearly | ✅ | ✅ | The collective's currency |

Patreon and other providers are deferred (D3). They will be added later through the same adapter interface.

### 1.2 Design principles

- **Zero setup.** There is no Sponsorkit account, dashboard, API key, callback URL or webhook.
- **Stateless.** Sponsorkit has no database and stores nothing about anyone. Everything a request needs is in the encrypted session token the SDK holds.
- **On demand.** When an app asks, Sponsorkit queries the provider with the **supporter's own sign-in token**. There are no webhooks and no background jobs.
- **Facts, not policy.** Contributions are returned per provider as raw data. Sponsorkit never aggregates them, converts currencies, or decides who "counts".
- **Never break the host app.** SDKs never throw because Sponsorkit or a provider is down (§7.2).
- **Never handle money.** Supporters pay on GitHub Sponsors or Open Collective.

### 1.3 Non-goals (v1)

- Webhooks.
- A database or any stored user data.
- A maintainer dashboard, accounts or keys.
- Payment processing.
- Tamper-proofing of client-side checks. Backends that need a trustworthy answer use §6.4.
- Bountyhunt, which has been removed entirely.

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **Target** | An account the maintainer receives sponsorships on: `github:<login>` or `opencollective:<slug>`. An SDK instance has one or more targets, called its **target set**. |
| **Supporter** | The end-user who signs in. |
| **Identity** | The supporter's GitHub or Open Collective account and its provider token. Identities exist only inside a sealed session token. |
| **Session token** | An opaque, encrypted blob (`sks_…`) held by the SDK. It contains the identities, the target set and the expiry (§4). Only the Sponsorkit Worker can read it. |
| **Contribution** | A sponsorship (GitHub) or order (Open Collective) from a sponsor entity to a target, normalized into the §5.1 shape. |
| **Sponsor entity** | Who actually pays: the user, or an organization the user belongs to (§5.5). |

## 3. Architecture

```
                        sponsorkit.io  (one Cloudflare Worker, free plan, no database)
                 ┌────────────────────────────────────────────────────────────┐
 Supporter ────▶ │ static (Next.js export): /, /docs, /connect, /checkout      │
 (browser)       │                      ← free, no Worker CPU                  │
 SDK in app ───▶ │ /api/v1/*      public API (Hono)                           │
 Your backend ─▶ │ /api/oauth/*   provider OAuth start/callback                │
 (forwards sks_) │ secrets: GitHub + OC OAuth credentials, sealing keys        │
                 └──────────────────────────────┬─────────────────────────────┘
                                                │ fetch, on demand
                                                ▼
                               GitHub GraphQL · Open Collective GraphQL
```

- **Runtime:**
  - TypeScript on **Cloudflare Workers**, using the **Hono** framework. Hono also runs on Node and Bun, so the Worker can be self-hosted.
  - Bun is used for local development, scripts and tests.
- **Web:** a Next.js static export. It contains the landing page, the docs (MDX), and two client-rendered supporter pages, `/connect` and `/checkout`. These are served as Worker static assets, which are free and don't invoke the Worker.
- **State:** none.
  - Session tokens, OAuth `state` values and sign-in codes are all **sealed**: encrypted and authenticated, so nothing needs storing (§4).
  - The only server-side cache is the free Workers Cache API, used for public target metadata (§5.6).
- **Secrets:** stored as Wrangler secrets. There are seven:
  - GitHub OAuth client ID and secret;
  - Open Collective OAuth client ID and secret;
  - `SEALING_KEYS`: the current and previous sealing keys, to allow rotation;
  - `PAIRWISE_KEY`: derives the pairwise supporter IDs;
  - `GITHUB_METADATA_TOKEN`: a token with no permissions, used only to read public Sponsors listings for `/targets`.
- **Rate limiting:**
  - The Workers Rate Limiting binding, keyed per IP and per session (a hash of the token).
  - One free WAF rule on `/api/v1/auth/*` as a backstop.
  - *To verify:* that the binding is available on the free plan.
- **No cron, no migrations, no background work.**

### 3.1 Free-plan budget

| Workers Free limit | How Sponsorkit fits |
|---|---|
| 100k requests/day | Static assets don't count. SDKs cache locally, so each user makes about one call per hour at most. |
| 10 ms CPU per request | One AES-GCM decrypt, JSON parsing, and waiting on network I/O, which doesn't count as CPU. No server-side rendering. |
| 50 subrequests per request | At most 1 GitHub GraphQL call plus 2 Open Collective calls. |

If Sponsorkit outgrows the free plan, Workers Paid costs $5/mo. Switching is a plan change only.

### 3.2 Repository layout (Bun workspaces)

```
app/                     Cloudflare Worker: Hono API, OAuth, sealing, static assets binding
  src/{api,oauth,seal,providers/{github,opencollective}}
  test/                  Vitest (Node); provider fetch stubbed with fixtures built from the documented schemas
web/                     Next.js static export (landing, docs, /connect, /checkout) + Playwright e2e
packages/shared/         Zod schemas & types (app, web, JS SDK)
sdks/{js,dotnet,python,go,rust}/
sdks/conformance/        fake API + fixtures + scenarios every SDK must pass
docs/                    this spec
.github/workflows/       CI, Worker deploy, trusted publishing
```

## 4. Sealed tokens (replaces the database)

All sealed values use **AES-256-GCM** with a 96-bit random nonce via Web Crypto, and are encoded as base64url.

Each sealed value has the format `prefix + keyId + nonce + ciphertext`. Associated data (AAD) binds each kind of value to its own purpose, so a value of one kind can't be passed off as another. Two keys are active at a time, which allows rotation without signing anyone out.

| Value | Contents | Lifetime | Where it travels |
|---|---|---|---|
| `state` (OAuth) | `{ provider, targets, delivery, origin?, redirectUri?, codeChallenge, appName?, browserNonceHash, providerPkceVerifier, exp }` | 10 min | Provider OAuth `state` parameter. A `__Host-` cookie nonce binds it to the browser that started the flow. |
| Sign-in code (`skc_…`) | `{ identity: { provider, id, handle, token, tokenExp }, targets, codeChallenge, delivery, origin?/redirectUri?, exp }` | 60 s, or 10 min for `paste` | Delivered to the SDK. Useless without the PKCE verifier. |
| Session token (`sks_…`) | `{ v, targets, identities: [ { provider, id, handle, token, tokenExp } ], iat, exp }` | 180 days, renewed on use | Held by the SDK. Sent as `Authorization: Bearer`. |

How sessions behave without a database:

- **Renewal.** When a session is more than 7 days old, a successful `/contributions` response includes a `Sponsorkit-Session` header carrying a freshly sealed token. The SDK stores it.
- **Sign-out.** Sign-out only deletes the token locally. A provider token can be revoked at GitHub or Open Collective, which invalidates that identity everywhere.
- **Replay.** A sign-in code can be replayed within its lifetime, but it is harmless: exchanging it needs the PKCE verifier, which only the initiating SDK holds.
- **Size.** A session token is about 0.5–1 KB, well within header limits.

## 5. Contribution data

### 5.1 Result shape (JSON; identical in every SDK)

```jsonc
{
  "signedIn": true,
  "disabled": false,
  "mock": false,
  "targets": ["github:mathiaslorenzen", "opencollective:sponsorkit"],
  "supporter": {
    "id": "sup_…",                          // pairwise: stable per (target set, identity) (§5.4)
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
  "stale": false,                           // some provider couldn't be reached; its data is from the SDK cache
  "fromCache": false                        // the whole result came from the SDK cache
}
```

If the user is signed out, the SDK is disabled, or mock mode is on, the result has `signedIn`, `disabled` or `mock` set, with `supporter: null` and `contributions: []` (unless mock data was supplied).

### 5.2 Status values & mapping

**Status values:**

- `active`
- `paused`
- `cancelled`
- `paid`: a completed one-time contribution
- `refunded`
- `disputed`
- `failed`
- `pending`

`active()` returns `active` contributions. Unknown provider values map to `pending` and are logged.

**GitHub:**

| GitHub data | Status |
|---|---|
| `isOneTimePayment=true` | `paid` |
| Recurring, `isActive=true` | `active` |
| Recurring, `isActive=false` | `cancelled` |
| `paymentSource=PATREON` | Adds the `via_patreon` flag |

GitHub only reports pending cancellations through webhooks, so a sponsorship stays `active` until it actually ends.

**Open Collective:**

| Open Collective status | Status |
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

### 5.3 How data is fetched (`GET /api/v1/contributions`)

1. **Open the session.** The Worker unseals the session token and rejects it if it is expired or tampered with. Then, for each identity × target of the same provider, it queries **live** with the identity's token. Calls run in parallel.
   - **GitHub:** one GraphQL request:
     `viewer { sponsorshipsAsSponsor(activeOnly:false, maintainerLogins:[…]) organizations(first:100) { nodes { login sponsorshipsAsSponsor(activeOnly:false, maintainerLogins:[…]) } } }`.
     This covers the user's own sponsorships and their orgs' sponsorships in a single call.
   - **Open Collective:** `me { orders(filter:OUTGOING, oppositeAccount:{slug}, includeIncognito:true) }`, plus `memberOf(role:ADMIN)` for collectives the user administers, and their orders to the target.
2. **Normalize and filter.** Results are normalized (§5.1) and filtered to the session's targets. Nothing is stored.
3. **Partial failure.** If one provider fails, the response still returns the others. It sets `stale: true` and lists `unavailable: ["opencollective"]`. The SDK then fills in that provider's contributions from its local cache.
   - An Open Collective target that doesn't exist yields no contributions and is **not** unavailable.
   - A target that exists but whose query fails, for example because it's private, is unavailable.
   - An expired or revoked provider token marks that identity `needsReconnect: true`.
   - Only an invalid or expired *session* is an error (`session_invalid`).
4. **Rate limits.** Requests are limited to one refresh per minute per session, enforced by the rate-limit binding. A refresh within the window returns `429` with `Retry-After`, and the SDK serves its cache. Provider quotas are per user token: GitHub allows 5,000/h and Open Collective 100/min, so normal use is far below them.

### 5.4 Privacy & consent

- **Consent screen.** It shows exactly which targets will be checked, with their verified avatar and name:

  > *"An app wants to know whether you sponsor **@mathiaslorenzen** on GitHub and **Sponsorkit** on Open Collective. It will see the amount, frequency and status of those contributions only, including private ones. Nothing else about your account is shared, and Sponsorkit stores nothing."*

- **Who is asking:**
  - Web apps: the requesting site's origin, taken from the browser.
  - Native apps: the SDK-supplied `appName`, labelled *"says it is"*.
- **Target binding.** The target set is sealed into the session, so the app can only ever learn about those targets. The provider token never leaves the Worker in readable form.
- **Pairwise supporter ID.** `supporter.id` is `sup_` + base32(HMAC(pairwise_key, targets_hash ‖ provider ‖ external_user_id)).
  - It is stable for the same person and the same target set, so a backend can key users on it.
  - Apps with different target sets cannot correlate users.
- **No storage.** Sponsorkit stores nothing. Request logs exclude tokens and identities.

### 5.5 Organization sponsorships

If an organization the user belongs to sponsors a target, the contribution is **always returned**, marked `via: "organization"` and `sponsor.type: "organization"`. For GitHub this means any org the user is a member of. For Open Collective it means an organization or collective the user administers.

The developer decides whether it counts; `fc.direct()` filters these out. Private org sponsorships may only be visible to org admins.

### 5.6 Targets metadata (`GET /api/v1/targets?github=…&opencollective=…`)

- **Access.** Public, cached for 1 h in the Workers Cache API.
- **Contents.** For each target: `exists`, display name, avatar, currency, and tiers (id, name, amount, frequency, URL).
- **Uses.**
  - the consent screen;
  - the checkout chooser;
  - SDK dev-time warnings, such as "github:foo has no Sponsors listing".
- **Fetching.** GitHub data is read with a Sponsorkit app credential; Open Collective is read anonymously.

## 6. Authentication

Sponsorkit acts as an OAuth-style authorization server for the SDKs. Provider OAuth runs in the Worker only, so SDKs never see provider tokens.

### 6.1 Rules

- **PKCE (S256) everywhere.**
  - Sign-in codes are sealed and bound to the PKCE challenge, the target set and the delivery target.
  - They are checked again at `POST /api/v1/auth/token`.
  - A code is useless without the verifier, which only the initiating SDK holds.
- **Delivery.** There are no registered origins, so how a code may be delivered is constrained by the delivery mechanism itself:
  - **`web_message`:** `/connect` posts the code only to `window.opener`, with `targetOrigin` set to the origin the SDK passed. The browser enforces that this origin is real. The origin is also shown on the consent screen.
  - **`redirect`** (fallback when popups are blocked): requires an `https` or localhost `redirect_uri`. The consent screen shows *"You'll return to ‹host›"*.
  - **`loopback`:** only `http://127.0.0.1:{port}/callback` or `http://[::1]:{port}/callback` (RFC 8252 §7.3).
  - **`paste`:** headless use. The page displays the code for the user to paste back into the app.
- **Provider OAuth `state`.** The state is sealed (§4) and checked against the `__Host-` browser nonce cookie. Any mismatch is rejected.

### 6.2 Flows

| Host | Flow |
|---|---|
| Browser | `signIn()`, called from a click handler, synchronously opens a popup to `/connect?targets=…&challenge=…&delivery=web_message&origin=…`. The user picks a provider, sees the consent screen and completes provider OAuth. The code is posted back to the app, and the SDK exchanges it. If popups are blocked, `delivery=redirect` is used when `returnTo` is set. Otherwise `signIn()` rejects with `popup_blocked`. |
| CLI / desktop with a local browser | **Loopback.** The SDK listens on `127.0.0.1:{random}/callback` and opens the system browser. |
| Headless / SSH / container | **Paste-back.** The SDK prints a `sponsorkit.io/connect?…&delivery=paste` URL, which the user opens on any device. After consent, the page shows the sign-in code with a copy button, and the user pastes it into the terminal. The page names the targets and the `appName`. The code is valid for 10 minutes and useless without the SDK's verifier. |
| Auto-pick | Native SDKs try loopback first. They fall back to paste-back when there is no display, when `SSH_CONNECTION` is set, or when opening the browser fails. |

**Adding a second identity.** `signIn({ provider: "opencollective" })` while already signed in runs the same flow. The SDK then sends `{ code, codeVerifier, sessionToken }` to `/auth/token`. The Worker unseals both and returns a new session token containing both identities, after checking that both are bound to the same target set.

### 6.3 Provider OAuth

| Provider | Scopes | Token |
|---|---|---|
| GitHub (one OAuth App) | `read:user read:org` | Doesn't expire. Identity key is `databaseId`. *To verify:* whether these scopes return tier amounts. If not, request `user` and disclose that on the consent screen (D6). GitHub keeps at most 10 tokens per user/app/scope, so a user signed in to more than 10 Sponsorkit apps loses the oldest one and is asked to sign in again there. |
| Open Collective (OAuth2 app) | `orders incognito` | Expires after 90 days, with no refresh. The identity is then flagged `needsReconnect`, and `signIn({ provider: "opencollective" })` re-seals the session with a fresh token. |

### 6.4 Backend verification

A backend never needs a key:

1. The frontend sends its session token to the backend.
2. The backend calls `GET /api/v1/contributions` with `Authorization: Bearer sks_…`.
3. The backend checks that the returned `targets` match its own.

The token can't be forged, because it is sealed with a key only Sponsorkit has. Each SDK's server helper does all of this:

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
  appName: "my-cli",                  // shown on the consent page for native apps
  cacheTtl: 3600,                     // seconds served from local cache without calling the API (min 60)
  mock: undefined,                    // §7.4
  storage: undefined,                 // default: localStorage / per-user config dir
  apiBaseUrl: undefined,              // self-hosting / tests
});

await sk.signIn();                     // provider picker; { provider } to skip it
sk.isSignedIn();
const fc = await sk.getFinancialContribution({ cacheTtl? });
const r = await sk.openCheckout({ provider?, amount?, currency?, frequency?, timeout?, signal? });
sk.checkoutUrl({ amount?, frequency? });   // sync, offline-safe link to /checkout (no sign-in)
await sk.signOut();                        // deletes token + cache locally
```

**Helpers** filter the result; they never sum across providers or currencies:

- `fc.active()`
- `fc.recurring()`
- `fc.oneTime()`
- `fc.byProvider(p)`
- `fc.direct()`

### 7.2 Error contract (identical in every SDK; enforced by the conformance suite)

| Situation | Behaviour |
|---|---|
| No targets, a malformed target, or a target that doesn't exist (checked at dev time) | **Throws** `SponsorkitError{code: "invalid_config"}`. The existence check calls `/targets` once per process, and is skipped in production builds where detectable. |
| Not signed in | Returns the signed-out result. No network call. |
| `session_invalid` | Clears the token and cache, then returns the signed-out result. |
| Provider partly unavailable | Merges the cached contributions for that provider and returns `stale: true`. |
| Network error, 5xx, `rate_limited` | Returns the cache (`fromCache: true, stale: true`). If there is no cache, returns a signed-in empty result with `stale: true`. Honours `Retry-After`. **Never throws.** |
| `SPONSORKIT_DISABLE=1` | No network or disk access. Returns `disabled: true`. `nag.due()` returns false. `signIn` and `openCheckout` reject with `disabled`. |
| Popup blocked | `signIn` and `openCheckout` reject with `popup_blocked`, unless the redirect fallback applies. |

### 7.3 Checkout (stateless)

`openCheckout(opts)` works in four steps:

1. **Sign in first if needed**, so the new contribution can be detected afterwards.
   - **Browser:** everything happens in **one** popup, opened synchronously: `/checkout?targets=…&amount=…&frequency=…&challenge=…&origin=…`. That page runs the connect flow when needed, posts the code back, and continues.
   - **Native:** the loopback callback redirects onward. With paste-back, the page continues after showing the code.
2. **Choose a provider.** The static `/checkout` page uses `/targets` data. If only one provider fits, it goes straight there; if both fit, it shows a small chooser. A provider is offered only if:
   - **Currency** matches exactly: USD for GitHub, the collective's currency for Open Collective.
   - **Frequency** is supported: monthly or one-time on GitHub, any frequency on Open Collective.
   - **Tier** fits (GitHub only): the cheapest tier at or above the amount is used, otherwise the highest tier. A listing with no tiers is disabled.

   Each disabled option shows the reason.
3. **Redirect** to the GitHub tier on `github.com/sponsors/{login}`, or to `opencollective.com/{slug}/donate?amount=…&interval=…&redirect=…`. *To verify:* GitHub's tier and frequency URL parameters.
4. **Detect the result.** Sponsorkit can't see the payment, so the SDK re-checks. It polls `getFinancialContribution({ cacheTtl: 0 })` every 60 s, starting after the popup closes (browser) or immediately (native). Polling stops when a new or changed contribution appears, or when `timeout` (default 10 min) or `signal` fires. The result is `{ status: "contributed", contribution }` or `{ status: "unknown" }`.

`checkoutUrl()` returns the same `/checkout` page without a PKCE challenge. It is offline-safe and suits nags and READMEs.

### 7.4 Mock mode

```ts
new Sponsorkit({ github: "x", mock: "active-monthly" });   // signed-out | none | active-monthly | one-time | cancelled | org
new Sponsorkit({ github: "x", mock: { contributions: [ /* §5.1 items */ ] } });
SPONSORKIT_MOCK=active-monthly                              // env var, same presets
```

- No network or disk access, and the result carries `mock: true`.
- `signIn()` and `openCheckout()` resolve immediately. `openCheckout()` simulates a new contribution.

### 7.5 Nag helper

```ts
const nag = sk.nag({ id: "my-cli", every: 10, orEvery: "P7D" });
if (await nag.due(fc => fc.active().length === 0)) {
  console.error(`❤️ Enjoying my-cli? Support it: ${sk.checkoutUrl({ frequency: "monthly" })}`);
  nag.shown();
}
```

- **Run counter.** It goes up by one per process per `id`, on the first `due()` call.
- **When a nag is due.** `due()` returns `predicate && (runs >= every || since(lastShown) >= orEvery)`. `shown()` resets both the counter and `lastShown`.
- **Durations.** ISO-8601 or the language's native duration type.
- **When `due()` always returns false:**
  - `SPONSORKIT_DISABLE`, `SPONSORKIT_NO_NAG` or `CI` is set;
  - stdout or stderr is not a TTY;
  - unless `{ force: true }` is passed.
- **No implicit sign-in.** `signIn()` is never called implicitly.

### 7.6 Local storage

- **Location:**
  - browsers: `localStorage`;
  - Linux: `$XDG_CONFIG_HOME/sponsorkit`;
  - macOS: `~/Library/Application Support/sponsorkit`;
  - Windows: `%APPDATA%\sponsorkit`.
- **Permissions.** Directories `0700`, files `0600`. On Windows the default user-profile ACL applies.
- **Keys.** The token, cache and nag state are keyed by `targets_hash`.
- **Writes** are atomic: write a temp file, then rename it.
- **Pluggable storage.** Storage can be replaced, for example with a keychain-backed store. v1 has no built-in keychain.
- **Token renewal.** A renewed token from `Sponsorkit-Session` replaces the stored one.
- **Sign-out.** `signOut()` and `session_invalid` clear both the token and the cache.

### 7.7 Web components & server helper

- **`@sponsorkit/sdk/elements`:**
  - `<sponsorkit-button github="…" opencollective="…" amount frequency>` opens the checkout synchronously.
  - `<sponsorkit-badge>` shows "Supporter ♥" when `active()` is non-empty.
- **`@sponsorkit/sdk/server`:** `verifySession(token, targets)` (§6.4), with an equivalent in every SDK.

### 7.8 Per-language surface

| | JS/TS | .NET | Python | Go | Rust |
|---|---|---|---|---|---|
| Package | `@sponsorkit/sdk` | `Sponsorkit` | `sponsorkit` | `github.com/sponsorkit/sponsorkit.io/sdks/go` | `sponsorkit` |
| Get | `getFinancialContribution()` | `GetFinancialContributionAsync(ct)` | `get_financial_contribution()` / `aget_…` | `GetFinancialContribution(ctx)` | `get_financial_contribution(GetOptions::default()).await?` |
| Sign in | popup, redirect, loopback, paste | loopback, paste | loopback, paste | loopback, paste | loopback, paste |
| UI elements | ✅ | – | – | – | – |
| Checkout, nag, cache, mock, error contract, `verifySession` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Runtime floor | Node 20+, Bun, Deno, evergreen browsers | netstandard2.0 / net8.0 | 3.10+ | Go 1.23+ | MSRV 1.85 |
| Runtime deps | none | System.Text.Json (netstandard only) | `httpx` | stdlib | `reqwest` (rustls), `serde`, `tokio` |

All five SDKs ship together in v1.

### 7.9 Conformance suite

`sdks/conformance/` contains a fake API and fixtures. Every SDK must pass the same scenarios:

- **Configuration and modes:** invalid configuration, disabled, mock presets.
- **Sign-in:** signed out, loopback sign-in, paste-back sign-in, adding a second identity.
- **Session:** session invalid, session renewal header.
- **Cache and network:** cache hit, offline with cache, offline without cache, partial provider outage, rate limiting with `Retry-After`.
- **Checkout:** detects a new contribution, times out (`unknown`), cancelled.
- **Nag:** run counting.
- **Storage:** file permissions, concurrent writes.
- **Server helper:** `verifySession` with matching targets, `verifySession` with mismatched targets.

## 8. HTTP API (`https://sponsorkit.io/api/v1`)

Requests and responses are JSON. Errors use `application/problem+json` with a stable `code`:

- `invalid_request`
- `invalid_target`
- `invalid_code`
- `session_invalid`
- `rate_limited`

CORS allows any origin, without credentials. Every response carries `Sponsorkit-Request-Id`.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /targets?github=&opencollective=` | none | Target metadata (§5.6) |
| `POST /auth/token` | none | `{code, codeVerifier, sessionToken?}` → `{sessionToken, expiresAt, result}` |
| `GET /contributions` | session | The §5.1 result. May return a renewed token in `Sponsorkit-Session`. |
| `GET /health` | none | Reachability of each provider |

Browser OAuth goes through `/connect` and `/checkout` (static) plus `/api/oauth/{provider}/start` and `/api/oauth/{provider}/callback`.

Rate limits (starting values):

| Endpoint | Limit |
|---|---|
| `/auth/*` and `/api/oauth/*` | 30/min per IP |
| `/contributions` | 1 refresh/min per session, 60/min per IP |
| `/targets` | 120/min per IP; cache misses limited to 20/min per IP and 60/min in total per location. This protects the shared GitHub metadata quota. |

## 9. Operations

- **Logs:** Workers Logs, structured JSON. Logs never contain tokens, codes or identities.
- **Deploy:** GitHub Actions runs `wrangler deploy`. Preview deployments use Workers versions. There are no migrations.
- **Sealing-key rotation:**
  1. Add the new key.
  2. Make it current.
  3. Remove the old key after 180 days.

  Tokens sealed with the old key are re-sealed on renewal, so nobody is signed out.

## 10. Delivery plan (after approval)

All of this lands in this PR as reviewable commits:

1. **Foundation.** Bun workspaces; the Hono Worker; sealing (with tests for tampering, expiry and key rotation); Zod schemas; rate limiting; Vitest. `docs/PROTOCOL.md` is the wire contract; no OpenAPI document is generated in v1.
2. **Auth.** Connect via popup, redirect, loopback and paste-back; second identity; pairwise IDs.
3. **Providers.** GitHub and Open Collective adapters, each covering target metadata, the live supporter query and normalization. Test suites with provider fetches stubbed using fixtures built from the documented responses.
4. **Checkout.** The `/checkout` page, provider eligibility and redirects.
5. **Web.** Landing page, docs, `/connect` and `/checkout`. Playwright end-to-end tests with providers faked.
6. **SDKs.** JS/TS as the reference, then .NET, Python, Go and Rust, plus the conformance suite.
7. **CI/CD.** Per-component tests; Worker deploy; trusted publishing to npm, NuGet, PyPI and crates.io; Go tags `sdks/go/vX.Y.Z`.

**Definition of done:**

- Everything builds and all tests pass.
- Going live needs only what §13 lists.
- Each item in §11 is either verified or listed in the PR as unverified.

## 11. Trade-offs & verifications

**Accepted trade-offs:**

- **Live calls on cache misses.** Every SDK cache miss is a live provider call (~0.3–1 s). Changes show up within `cacheTtl` (default 1 h).
- **No server-side sign-out.** Sign-out deletes the token locally. A provider-side revocation invalidates the identity everywhere.
- **GitHub's 10-token limit.** A user signed in to more than 10 Sponsorkit apps is signed out of the oldest one.
- **No pending cancellations on GitHub.** GitHub reports them only via webhooks, so they show as `active` until the sponsorship ends.
- **Open Collective sign-ins expire after 90 days**, flagged with `needsReconnect`.
- **Nothing is known about a supporter until they sign in through the app.**
- **No dashboard, analytics or verified app identity.**
- **Checkout can't confirm payment.** It may report `unknown` even when the supporter paid.

**Verifications.** Everything was built and tested against the documented schemas and stubbed provider responses. These items still need a live check with real OAuth apps before launch:

| # | Item | Status | If it's wrong |
|---|---|---|---|
| a | GitHub `read:user read:org` returns `tier` amounts and the user's PRIVATE sponsorships | **Unverified (live)** | Switch to the `user` scope (D6). Until then the amount falls back to `0 USD`. |
| b | GitHub `?tier_id=<databaseId>` deep link preselects the tier (the databaseId is decoded from the node id) | **Unverified (live)** | `/checkout` already falls back to `github.com/sponsors/<login>`. |
| c | Nested `viewer.organizations { sponsorshipsAsSponsor }` query | **Verified against the public GraphQL schema**; not checked live | Use per-org aliases. |
| d | `GITHUB_METADATA_TOKEN` (no-permission token) can read public `sponsorsListing.tiers` | **Unverified (live)** | Use a classic token with no scopes. |
| e | Open Collective `includeIncognito: true` with a user OAuth token, and PKCE support | **Unverified (live)** (PKCE inferred from the OC server source) | Incognito orders are missing for that user. |
| f | Workers Rate Limiting binding on the free plan | **Unverified** | The code no-ops without the binding. Add a WAF rule. |

## 12. Decisions

| # | Decision | Outcome |
|---|---|---|
| D1 | Stripe processing fees | Moot: Stripe removed (D8). |
| D2 | Hosting | ✅ One Cloudflare Worker (free plan), TypeScript, static site. |
| D3 | Patreon | ✅ Deferred: its shared-app consent would require reading all of a user's memberships. |
| D4 | Package names | ✅ `@sponsorkit/sdk`, `Sponsorkit`, `sponsorkit` (PyPI and crates.io), `github.com/sponsorkit/sponsorkit.io/sdks/go`. Fall back to `sponsorkit-sdk` if a name is taken. |
| D5 | Org sponsorships | ✅ Always included, marked `via: "organization"`. |
| D6 | GitHub scope | ✅ `read:user read:org`. Switch to `user` only if amounts are missing, and disclose it. |
| D7 | Webhooks | ✅ None. |
| D8 | Stripe Connect | ✅ Removed. |
| D9 | Accounts and keys | ✅ None. The SDK takes target handles directly. |
| D10 | Server verification | ✅ Forward the supporter's session token. |
| D11 | Test mode | ✅ The SDK `mock` option. |
| D12 | Supporter accounts | ✅ None. A session holds its identities. |
| D13 | Checkout | ✅ Stateless: sign in, redirect, then re-check. |
| D14 | SDK rollout | ✅ All five SDKs in v1. |
| D15 | Database | ✅ None. Sealed session tokens; the cache lives in the SDK; headless sign-in is paste-back. |

## 13. What you need to provide to go live

1. A **GitHub OAuth App** with its callback URL set to `https://sponsorkit.io/api/oauth/github/callback`: client ID and secret.
2. An **Open Collective OAuth app** with its callback URL set to `https://sponsorkit.io/api/oauth/opencollective/callback`: client ID and secret.
3. A free **Cloudflare account** with:
   - `sponsorkit.io` as a zone, used by the `custom_domain` route in `app/wrangler.jsonc`;
   - an API token that can edit Workers, plus your account ID.
4. **Worker secrets**, set with `wrangler secret put` (see `app/.dev.vars.example` for formats and key generation):
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
   - `OPENCOLLECTIVE_CLIENT_ID`, `OPENCOLLECTIVE_CLIENT_SECRET`
   - `SEALING_KEYS`, `PAIRWISE_KEY`
   - `GITHUB_METADATA_TOKEN`
5. **GitHub repository settings for deploys:**
   - secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`;
   - the variable `DEPLOY_ENABLED=true`;
   - a `production` environment.
6. **Package registries:**
   - Reserve the names: `@sponsorkit/sdk` on npm, `Sponsorkit` on NuGet, and `sponsorkit` on PyPI and crates.io.
   - Configure trusted publishing for `.github/workflows/release.yml` (environment `release`). NuGet also needs the repository variable `NUGET_USER`.
   - Release an SDK by pushing a tag `sdks/<sdk>/v<version>` that matches the version in its manifest.
7. A **LICENSE decision.** The package manifests declare MIT, and `sdks/go` and `sdks/rust` include MIT license files, but there is no root `LICENSE` yet.
8. The **live verifications** in §11.
