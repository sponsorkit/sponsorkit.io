---
title: Wire protocol
description: A readable tour of the Sponsorkit wire protocol, from targets and PKCE sign-in to sealed tokens, checkout rules and the SDK storage format.
order: 20
---

The [wire protocol](https://github.com/sponsorkit/sponsorkit.io/blob/main/docs/PROTOCOL.md) is the contract
between the Worker (the API), the static pages (the site), the conformance suite and every SDK. This page walks through it in plain
language. When the two disagree, PROTOCOL.md wins. The reasons behind the design are in the
[specification](https://github.com/sponsorkit/sponsorkit.io/blob/main/docs/SPEC.md).

You need this if you're writing an SDK for another language, reviewing Sponsorkit's security, or running your own
instance. To use Sponsorkit from an app, the [guides](../guides/index.md) are a better start.

## Site and API

Sponsorkit runs in two places, on different origins:

| Part | What | Default |
|---|---|---|
| **Site** | The static export of the website: landing page, docs, `/connect/`, `/connect/done/`, `/checkout/`, `/checkout/thanks/`. Hosted on GitHub Pages. | `https://sponsorkit.github.io/sponsorkit.io` |
| **API** | The Cloudflare Worker: `/api/v1/…` and `/api/oauth/…`, nothing else. | `https://api.sponsorkit.io` |

Page URLs are relative to the site base URL and always end in `/` (GitHub Pages serves directories). API paths
are relative to the API origin. SDKs take both as options, `siteBaseUrl` and `apiBaseUrl`; setting only
`apiBaseUrl` uses it for both, which suits an instance that serves the site and the API from one origin.

## Targets

A **target** is an account that receives contributions, written `github:<login>` or `opencollective:<slug>`. The
account is trimmed and lowercased, and must be a valid GitHub login or Open Collective slug.

A **target set** has one or more targets, at most one per provider. Its canonical form is deduplicated, sorted by
the string form (byte-wise ASCII) and joined with commas:

```text
github:octocat,opencollective:my-project
```

That string is the `targets` parameter in every URL. Its lowercase hex SHA-256 is the **targets hash**, which
SDKs use to name their storage files. Two apps with the same targets therefore share a session on the same machine.
See [Targets](../concepts/targets.md).

## Sign-in

Sign-in is an OAuth-style flow with [PKCE](https://www.rfc-editor.org/rfc/rfc7636), designed so that no app has
to register anything:

1. **The SDK** generates a random code verifier (32 bytes, base64url, 43 characters) and its S256 challenge.
2. **The SDK** opens the site's `/connect/?targets=…&challenge=…&delivery=…` (plus `origin`, `redirect_uri` or
   `app_name`, depending on the delivery).
3. **The consent page** loads the targets' public metadata and shows who is asking, which accounts will be
   checked and what will be shared. The person picks GitHub or Open Collective.
4. **The consent page** submits the sign-in parameters as a top-level form POST to the API's
   `/api/oauth/:provider/start`. **The Worker** checks that the request came from the consent page (its `Origin`
   header must be exactly the site's origin), sets a short-lived `__Host-` nonce cookie on the API's domain, seals
   everything it needs into the OAuth `state`, and redirects to the provider.
5. **The provider** asks the person to authorize, and redirects back to the API's `/api/oauth/:provider/callback`.
6. **The Worker** checks the state against the cookie, exchanges the provider code for a token, reads the person's
   provider user id, and seals all of it into a **sign-in code** (`skc_…`) bound to the challenge.
7. **The code is delivered** to the app (see below).
8. **The SDK** exchanges the code and its verifier at
   [`POST /api/v1/auth/token`](http-api.md#post-auth-token) for a **session token** (`sks_…`).

Provider tokens never leave the Worker in readable form, and a code is useless without the verifier, which never
leaves the SDK.

### Why the start is a form POST

The consent screen is the only place the supporter sees who is asking and which accounts will be checked, and
providers don't ask again for an app the supporter already authorized. So the start endpoint must only accept
requests from the consent page. Because the site and the API are on different sites, the Worker checks the
`Origin` header, which browsers set themselves and pages can't forge, and which they always send on a POST. A
`GET` is never accepted, so no link or redirect can start a sign-in; a request without the right `Origin` gets a
page that links to the consent screen. The consent pages use the referrer policy `strict-origin` (under
`no-referrer` browsers would send `Origin: null`) and hide their provider buttons when framed. The residual risks
(every page on the shared `sponsorkit.github.io` origin is trusted, framing, social engineering) are listed in
[PROTOCOL.md §4.3](https://github.com/sponsorkit/sponsorkit.io/blob/main/docs/PROTOCOL.md#security-cross-site-consent-start).

### Delivery methods

How the code gets back to the app depends on where the app runs. Each method limits where a code can go, so no
allowlist of apps is needed:

| `delivery` | Used by | How the code arrives | What keeps it safe |
|---|---|---|---|
| `web_message` | Browser apps (popup) | The site's `/connect/done/` posts it to `window.opener` with `postMessage`. | The browser only delivers to the `origin` the SDK named; that origin is shown on the consent screen. The SDK only accepts messages whose origin is the site's. |
| `redirect` | Browser apps when the popup is blocked | Redirect to `redirect_uri` with `?sponsorkit_code=…`. | `redirect_uri` must be `https` or localhost; its host is shown on the consent screen. |
| `loopback` | Desktop apps and CLIs | Redirect to `http://127.0.0.1:<port>/callback?code=…`. | Only a loopback address on the person's own machine is accepted ([RFC 8252](https://www.rfc-editor.org/rfc/rfc8252#section-7.3)). |
| `paste` | Headless machines | The site's `/connect/done/` shows the code to copy into the app. | The code expires in 10 minutes and needs the verifier. |

For native apps, the consent screen shows the SDK-supplied `app_name` labelled "says it is", because nothing can
verify it. If sign-in fails at the provider, the Worker delivers `access_denied`, `invalid_state` or
`provider_error` the same way it would deliver a code.

### Adding an identity

A session can hold one GitHub and one Open Collective identity. Signing in again with the other provider sends
the existing `sessionToken` along with the new code, and the Worker returns a new session holding both. Signing
in again with the same provider replaces that identity, which is how an expired one is reconnected.

## Sealed values

Sponsorkit has no database. Everything it needs to remember travels in **sealed values**: JSON encrypted and
authenticated with AES-256-GCM under a key only the Worker has.

```text
<prefix> base64url( keyId (1 byte) ‖ nonce (12 bytes) ‖ ciphertext + tag )
```

| Value | Prefix | Holds | Lifetime |
|---|---|---|---|
| OAuth state | none | Provider, targets, delivery parameters, challenge, nonce hash, provider PKCE verifier | 10 minutes |
| Sign-in code | `skc_` | The identity and its provider token, targets, challenge, delivery parameters | 60 s, or 10 minutes for `paste` |
| Session token | `sks_` | Up to two identities with their provider tokens, the targets, issue time | 180 days, renewed after 7 days of age |

Each kind is sealed with its own associated data (`sponsorkit:<kind>:v1`), so one kind can't be passed off as
another. Any failure to unseal is treated the same way (`invalid_code` or `session_invalid`), so errors reveal
nothing about why.

`SEALING_KEYS` holds several keys: the first one seals, and all of them unseal. That makes rotation possible
without signing anyone out (see [Self-hosting](self-hosting.md#rotating-keys)).

## Contributions

`GET /api/v1/contributions` unseals the session and, for each identity, queries its provider live with that
identity's token, in parallel. Results are normalized into one shape (see
[Contributions](../concepts/contributions.md)), filtered to the session's targets and returned. Nothing is stored.

- Contributions from organizations the person belongs to are included, marked `via: "organization"`.
- If one provider fails, the others are still returned; the failed one is listed in `unavailable`.
- An expired or revoked provider token marks that identity `needsReconnect` instead of failing the request.
- `supporter.id` is a pairwise id: an HMAC of the targets hash, provider and provider user id of the session's
  first identity. It's stable per person and target set, and different across apps with different targets.

## Checkout

`/checkout/` is a static page on the site. Given `targets` and optional `amount`, `currency`, `frequency` and `provider`, it
offers a provider only if:

1. the account exists;
2. the frequency is supported (GitHub: monthly and one-time; Open Collective: one-time, monthly and yearly);
3. the currency matches (GitHub is always USD; Open Collective uses the collective's currency);
4. for GitHub, a tier exists for the frequency.

If exactly one provider fits, the page redirects straight to it; otherwise it shows a chooser that explains each
disabled option. It never switches away from a requested provider silently.

- **GitHub:** the cheapest tier at or above the amount, otherwise the highest; the tier's URL when known, else
  `https://github.com/sponsors/<login>`.
- **Open Collective:** `https://opencollective.com/<slug>/donate` with the amount in major units (using ISO 4217
  minor-unit digits, so `JPY` has none and `KWD` has three), `interval=month|year`, and a redirect back to
  the site's `/checkout/thanks/`.

With a `challenge`, the page signs the person in first and continues to the chooser afterwards, so the SDK can
detect the new contribution. Without one (a link from `checkoutUrl()`), it skips sign-in.

## What every SDK must do

Section 7 of the protocol pins down the SDK behaviour that apps rely on, so that the five SDKs are
interchangeable:

- **Options** with the same meaning everywhere: `apiBaseUrl`, `siteBaseUrl`, `openBrowser`, `promptForCode`, `storageDir` or
  `storage`, `clock`, `signInTimeout`, `interactive`, `signInMethod`, `env`, `devChecks`,
  `checkoutPollInterval`, `requestTimeout` and a way to reset per-process state.
- **The error contract:** `getFinancialContribution()` never throws for network or server problems and serves its
  cache instead; other errors carry one of the shared codes. See
  [Handle errors and offline](../guides/errors-and-offline.md).
- **Robustness rules:** a 30-second request timeout, a clamped `Retry-After`, storage reads that never throw,
  atomic writes, and refreshes that never overwrite a newer sign-in or sign-out.
- **The sign-in flows** (loopback with paste-back fallback), the checkout polling rules, the nag formula and the
  mock presets, byte for byte.

### Storage format

Native SDKs keep one JSON file per target set, `<targets hash>.json`, in a per-user directory (mode `0700`, files
`0600`, written atomically). The browser SDK keeps the same JSON in `localStorage` under
`sponsorkit:<targets hash>`:

```json
{
  "v": 1,
  "sessionToken": "sks_…",
  "cache": { "result": { "signedIn": true, "contributions": [] }, "storedAt": "2026-11-17T18:00:00.000Z" },
  "nags": { "my-cli": { "runs": 3, "lastShown": null } }
}
```

(`result` holds a full contribution result; it's shortened here.) Because the format is shared, a person signed
in through one SDK is signed in for every app on the machine that uses the same targets, whatever its language.

## Conformance suite

[`sdks/conformance`](https://github.com/sponsorkit/sponsorkit.io/tree/main/sdks/conformance) contains a fake
Sponsorkit API (`bun sdks/conformance/server.ts`), which also serves the site's `/connect/` and `/checkout/` paths
so tests only need to set `apiBaseUrl`, and a list of scenarios with expected results: sign-in flows,
caching, outages, rate limits, checkout, nags, storage and `verifySession`. Every SDK runs every scenario in its
own test framework. A new SDK is done when it passes them all.
