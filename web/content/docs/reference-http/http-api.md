---
title: HTTP API
description: Every endpoint of the Sponsorkit HTTP API (/api/v1), with request and response examples, headers, error codes and rate limits.
order: 10
---

The SDKs are thin clients of this API. You only need it to build an SDK for another language, to verify sessions
from a backend without an SDK, or to debug. Everything here is specified normatively in the
[wire protocol](https://github.com/sponsorkit/sponsorkit.io/blob/main/docs/PROTOCOL.md#3-http-api-apiv1); this
page explains it with examples.

## Conventions

- **Base URL:** `https://sponsorkit.io`, or your own origin if you [self-host](self-hosting.md). Every path below
  is relative to it.
- **Format:** requests and responses are JSON. Amounts are integers in minor units with an ISO 4217 currency
  (`{ "value": 500, "currency": "USD" }` is $5.00). Timestamps are ISO 8601 strings.
- **Authentication:** only `GET /api/v1/contributions` needs it, as `Authorization: Bearer sks_…`. There are no
  API keys.
- **Request ID:** every response carries a `Sponsorkit-Request-Id` header. Include it when you report a problem.
- **CORS:** `/api/v1/*` allows any origin (`Access-Control-Allow-Origin: *`) without credentials. Allowed request
  headers are `Authorization` and `Content-Type`; exposed response headers are `Sponsorkit-Session`,
  `Sponsorkit-Request-Id` and `Retry-After`. So browsers can call the API directly.

### Errors

Errors use [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem details with the content type
`application/problem+json`, plus a stable `code`:

```json title="400 Bad Request"
{
  "type": "https://sponsorkit.io/docs#error-contract",
  "title": "Invalid target",
  "status": 400,
  "code": "invalid_target",
  "detail": "Invalid github account \"-octocat\""
}
```

Branch on `code`, not on `title` or `detail`, which are for humans and may change.

| Code | Status | Meaning |
|---|---|---|
| `invalid_request` | 400 | The request body is not JSON, doesn't have the expected shape, or names a session with a different target set. |
| `invalid_target` | 400 | A `github` or `opencollective` parameter is malformed, or neither was given. |
| `invalid_code` | 400 | The sign-in code is malformed, expired or tampered with, or the code verifier doesn't match. |
| `session_invalid` | 401 | The session token is missing, malformed, tampered with, expired or sealed with an unknown key. |
| `rate_limited` | 429 | Too many requests. Wait for the number of seconds in `Retry-After`. |
| `not_found` | 404 | No such endpoint. |
| `internal` | 500, 502 | Something went wrong on the server (500), or a provider couldn't be reached (502). |

### Rate limits

All limits use a 60-second window and are keyed by client IP or by session. A request over a limit gets
`429 rate_limited` with `Retry-After: 60` (the `/api/oauth/*` endpoints, which browsers navigate to, answer with an
HTML page instead).

| Scope | Limit |
|---|---|
| Everything under `/api/` | 120 requests per minute per IP |
| `/api/v1/auth/*` and `/api/oauth/*` | 30 requests per minute per IP |
| `GET /api/v1/contributions` | 60 requests per minute per IP, and **1 per minute per session** |
| `GET /api/v1/targets`, uncached lookups | 20 per minute per IP, and 60 per minute in total |

The per-session limit is keyed on the session's targets and identities, so a renewed token doesn't reset it. It's
shared by everyone using that session: the app and any backend verifying it.

## GET /api/v1/targets {#get-targets}

Public metadata about the accounts that receive contributions: whether they exist, their display name and
avatar, currency and tiers. The consent and checkout pages use it, and SDKs use it for the dev-time check that
your targets exist. No authentication.

**Query parameters:** `github=<login>` and/or `opencollective=<slug>`. At least one is required. Values are
trimmed and lowercased.

```bash
curl "https://sponsorkit.io/api/v1/targets?github=octocat&opencollective=my-project"
```

```json title="200 OK"
{
  "targets": [
    {
      "target": "github:octocat",
      "provider": "github",
      "account": "octocat",
      "exists": true,
      "displayName": "The Octocat",
      "avatarUrl": "https://avatars.githubusercontent.com/u/583231?v=4",
      "url": "https://github.com/sponsors/octocat",
      "currency": "USD",
      "frequencies": ["monthly", "one_time"],
      "customAmount": false,
      "tiers": [
        {
          "id": "ST_kwDOAAjq784AAg4z",
          "name": "$5 a month",
          "amount": { "value": 500, "currency": "USD" },
          "frequency": "monthly",
          "url": "https://github.com/sponsors/octocat/sponsorships?tier_id=134707"
        }
      ]
    },
    {
      "target": "opencollective:my-project",
      "provider": "opencollective",
      "account": "my-project",
      "exists": true,
      "displayName": "My Project",
      "avatarUrl": "https://images.opencollective.com/my-project/logo.png",
      "url": "https://opencollective.com/my-project",
      "currency": "EUR",
      "frequencies": ["one_time", "monthly", "yearly"],
      "customAmount": true,
      "tiers": [
        {
          "id": "nb8vq0z4-3plk-7xme-a5rw-9g7ld6yjoe2k",
          "name": "Backer",
          "amount": { "value": 500, "currency": "EUR" },
          "frequency": "monthly",
          "url": null
        }
      ]
    }
  ]
}
```

Targets are returned in canonical order (sorted by their string form). Details:

- **An account that doesn't exist is still returned**, with `exists: false`. A GitHub account without a Sponsors
  listing also has `exists: false`, though `displayName` and `avatarUrl` are filled in. An Open Collective
  account has `exists: true` only if it can receive contributions, is active and isn't archived.
- **`customAmount`** is always `true` for an Open Collective account that exists. GitHub doesn't expose its
  "custom amounts" setting, so it's `true` only when a published tier allows custom amounts.
- **Tiers:** GitHub tier `id`s are GraphQL node ids. Open Collective tiers with a flexible frequency and tiers
  that aren't contributions (tickets, products) are left out, and their `url` is always `null`.

**Caching:** successful responses carry `Cache-Control: public, max-age=3600` and are also cached by the Worker
for an hour.

**Errors:** `400 invalid_target`; `502 internal` when a provider couldn't be reached (not cached); `429`.

## POST /api/v1/auth/token {#post-auth-token}

Exchanges a sign-in code (`skc_…`) for a session token. SDKs call it after the consent page has delivered the
code. The code is bound to a [PKCE](https://www.rfc-editor.org/rfc/rfc7636) challenge, so only the client that
started the sign-in, which holds the verifier, can exchange it.

**Request body:**

| Field | Type | Meaning |
|---|---|---|
| `code` | string | The sign-in code from the consent page. |
| `codeVerifier` | string | The PKCE verifier, 43–128 characters. |
| `sessionToken` | string, optional | An existing session, to add this identity to it. |

```bash
curl https://sponsorkit.io/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"code":"skc_…","codeVerifier":"dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"}'
```

```json title="200 OK"
{
  "sessionToken": "sks_AWkx…",
  "expiresAt": "2027-05-16T18:00:00.000Z",
  "result": {
    "signedIn": true,
    "disabled": false,
    "mock": false,
    "targets": ["github:octocat"],
    "supporter": {
      "id": "sup_q5u2nh7s3lvkx4w3a6c2ybmzr4fo2e3d",
      "identities": [{ "provider": "github", "id": "1234567", "handle": "mona", "needsReconnect": false }]
    },
    "contributions": [],
    "fetchedAt": "2026-11-17T18:00:00.000Z",
    "stale": false,
    "fromCache": false
  }
}
```

`result` is the same object [`GET /api/v1/contributions`](#get-contributions) would return, fetched live, so the
app can show something straight away. The session expires 180 days after it was issued (`expiresAt`), and is
renewed while it's used.

**Adding an identity:** when `sessionToken` is given, the new identity is added to that session, replacing an
existing identity of the same provider (that's how an expired one is reconnected). The response holds a new token
with both identities. `supporter.id` doesn't change, because it's derived from the session's first identity.

**Errors:**

| Status | Code | When |
|---|---|---|
| 400 | `invalid_code` | The code is malformed, expired (60 s, or 10 minutes for paste-back) or tampered with, or the verifier doesn't match. |
| 400 | `invalid_request` | The body isn't valid, or `sessionToken` belongs to a different target set. |
| 401 | `session_invalid` | `sessionToken` is invalid. SDKs then retry once without it, starting a fresh session. |
| 429 | `rate_limited` | Too many sign-ins from this IP. |

A code can be exchanged more than once within its lifetime. That's harmless, because the verifier never leaves
the client, and it lets the SDKs retry after a `session_invalid`.

## GET /api/v1/contributions {#get-contributions}

What the signed-in supporter (and the organizations they belong to) has contributed to the session's targets,
fetched live from GitHub and Open Collective with the supporter's own provider tokens.

```bash
curl https://sponsorkit.io/api/v1/contributions \
  -H "Authorization: Bearer sks_AWkx…"
```

```json title="200 OK"
{
  "signedIn": true,
  "disabled": false,
  "mock": false,
  "targets": ["github:octocat", "opencollective:my-project"],
  "supporter": {
    "id": "sup_q5u2nh7s3lvkx4w3a6c2ybmzr4fo2e3d",
    "identities": [
      { "provider": "github", "id": "1234567", "handle": "mona", "needsReconnect": false },
      { "provider": "opencollective", "id": "98765", "handle": "mona", "needsReconnect": true }
    ]
  },
  "contributions": [
    {
      "id": "con_github_N2xh0p3dXcU9zb8kYwQe1A",
      "provider": "github",
      "target": "github:octocat",
      "sponsor": { "type": "user", "provider": "github", "id": "1234567", "handle": "mona" },
      "via": "direct",
      "kind": "recurring",
      "frequency": "monthly",
      "status": "active",
      "amount": { "value": 500, "currency": "USD" },
      "tier": { "id": "ST_kwDOAAjq784AAg4z", "name": "$5 a month" },
      "flags": [],
      "private": false,
      "startedAt": "2026-03-02T10:15:00Z",
      "endedAt": null,
      "lastChargedAt": null,
      "nextChargeAt": null,
      "totalContributed": null
    }
  ],
  "fetchedAt": "2026-11-17T18:00:00.000Z",
  "stale": true,
  "fromCache": false,
  "unavailable": ["opencollective"]
}
```

The shape is the same one every SDK returns from `getFinancialContribution()`. The fields are described in
[Contributions](../concepts/contributions.md) and [Statuses](../concepts/statuses.md). From the API, `signedIn` is
always `true` and `disabled`, `mock` and `fromCache` are always `false`.

**Partial results.** If a provider couldn't be queried, the response still succeeds: that provider is listed in
`unavailable`, `stale` is `true`, and its contributions are left out. SDKs fill them in from their cache. In the
example above, the Open Collective sign-in has expired (`needsReconnect: true`), which is reported the same way.

**Session renewal.** When the session is more than 7 days old, the response carries a `Sponsorkit-Session: sks_…`
header with a renewed token (fresh 180-day expiry, sealed with the current key). Clients must replace their stored
token with it. A session that's used at least every 180 days therefore never expires.

**GitHub amounts.** When GitHub hides a sponsorship's tier, `amount` is `{ "value": 0, "currency": "USD" }` and
`tier` is `null`.

**Errors:**

| Status | Code | When |
|---|---|---|
| 401 | `session_invalid` | The token is missing, malformed, tampered with, expired or sealed with an unknown key. |
| 429 | `rate_limited` | More than one refresh per minute for this session, or 60 per minute from this IP. |

Responses carry `Cache-Control: no-store`.

## GET /api/v1/health {#get-health}

Whether the Worker can reach each provider. No authentication. The answer is cached in the Worker for 30 seconds.

```bash
curl https://sponsorkit.io/api/v1/health
```

```json title="200 OK"
{ "ok": true, "providers": { "github": "ok", "opencollective": "degraded" } }
```

Each provider is `"ok"` or `"degraded"`.

## Browser pages and OAuth endpoints

Sign-in and checkout run in the browser, through two static pages and two Worker endpoints. SDKs only build the
first URL; the rest is navigation.

| URL | What it does |
|---|---|
| `/connect?targets=…&challenge=…&delivery=…` | The consent page: shows the targets, who is asking and one button per provider. |
| `/api/oauth/:provider/start?…` | Starts OAuth with GitHub or Open Collective. Only accepts navigations from the consent page. |
| `/api/oauth/:provider/callback` | The provider's redirect target. Creates the sign-in code and delivers it to the app. |
| `/connect/done` | Posts the code to the opener (popup flow) or shows it for paste-back. |
| `/checkout?targets=…` | Signs in if a `challenge` is given, then picks a provider and redirects to it. |

`delivery` is one of `web_message` (popup), `redirect`, `loopback` or `paste`. The parameters, the delivery
rules and the checkout eligibility rules are summarized in [Wire protocol](protocol.md) and specified in
[PROTOCOL.md §4](https://github.com/sponsorkit/sponsorkit.io/blob/main/docs/PROTOCOL.md#4-browser-pages--oauth-endpoints).
