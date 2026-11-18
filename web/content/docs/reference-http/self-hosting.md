---
title: Self-hosting
description: Run your own Sponsorkit, an API Worker on your domain plus the static site on GitHub Pages or any static host, with your own OAuth apps and keys, and point every SDK at it.
order: 30
---

Sponsorkit is one stateless Cloudflare Worker (the API) plus a static website (the consent, checkout and docs
pages). There's no database, no cron job and no migration, so running your own instance means creating two OAuth
apps, generating two keys, deploying the Worker and publishing the static site. You might do this to control the
consent screen's domain, to keep supporter traffic on your own infrastructure, or to develop Sponsorkit itself.

## What you're deploying

- **The API** (`app/`): a Cloudflare Worker, written with [Hono](https://hono.dev/), on its own domain. It serves
  only the HTTP API (`/api/v1/…`) and provider OAuth (`/api/oauth/…`), and no pages or static files: every other
  path is a `404`.
- **The site** (`web/`): this website, including the `/connect/` consent page and the `/checkout/` page. It's a
  static export (`web/out`) that you can host anywhere static files are served. The official instance publishes it
  to GitHub Pages; page views never reach the Worker.

The site's pages call the API from the browser (`/api/v1/targets`, with CORS), and the consent page starts
sign-in with a form POST to the API. The Worker only accepts that POST when the browser's `Origin` header is
exactly the site's origin, so the Worker has to know where the site lives.

| | Official instance | Example used below |
|---|---|---|
| API origin | `https://api.sponsorkit.io` | `https://sponsorkit-api.example.com` |
| Site base URL (origin plus path) | `https://sponsorkit.github.io/sponsorkit.io` | `https://example.github.io/sponsorkit.io` |
| Site origin | `https://sponsorkit.github.io` | `https://example.github.io` |

You can also serve both from **one origin** (see [Single origin](#single-origin)).

The Worker configuration lives in `app/wrangler.jsonc`. The Worker is written against the Workers runtime (Workers
Cache, rate-limiting bindings). Hono itself also runs on Node.js and Bun, but the repository only ships the
Cloudflare setup.

You need a Cloudflare account (the free plan is enough to start) with a domain on it for the API,
somewhere to host static files (a GitHub repository with GitHub Pages is enough), [Bun](https://bun.sh/), and a
clone or fork of the [repository](https://github.com/sponsorkit/sponsorkit.io).

## 1. Create the OAuth apps

Sponsorkit signs supporters in with their own GitHub and Open Collective accounts, so it needs an OAuth app on
each. The callback URL is always on the **API** origin: `<API origin>/api/oauth/<provider>/callback`.

**GitHub.** Create an **OAuth App** (not a GitHub App) under *Settings → Developer settings → OAuth Apps*:

| Field | Value |
|---|---|
| Homepage URL | `https://example.github.io/sponsorkit.io` (your site) |
| Authorization callback URL | `https://sponsorkit-api.example.com/api/oauth/github/callback` |

Note the client ID and generate a client secret. Sponsorkit requests the `read:user read:org` scopes, and uses
PKCE on top of the client secret.

**Open Collective.** Create an OAuth application in the developer settings of your Open Collective account, with
the callback URL `https://sponsorkit-api.example.com/api/oauth/opencollective/callback`. Note its client ID and
secret. Sponsorkit requests the `orders incognito` scopes, so it can see private ("incognito") contributions to
your targets.

**Metadata token.** The consent and checkout pages show your targets' public Sponsors tiers, which GitHub only
serves to authenticated requests. Create a [fine-grained personal access
token](https://github.com/settings/personal-access-tokens/new) with **no permissions**. It's only used for
`GET /api/v1/targets`, never for supporter data. Every uncached lookup spends this token's GraphQL quota, which is
why uncached `/targets` lookups are rate-limited.

:::tip
Create a second pair of OAuth apps for local development, with callback URLs on `http://localhost:8787`
(the `wrangler dev` default). GitHub OAuth Apps accept one callback URL each.
:::

## 2. Generate the keys

**`SEALING_KEYS`** encrypts the OAuth state, sign-in codes and session tokens. It's a JSON array of keys, each with
an `id` (an integer from 0 to 255) and a `key` (32 random bytes, base64url-encoded). Generate a key with any of
these:

```bash title="Generate a 32-byte key"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

Then wrap it:

```json title="SEALING_KEYS"
[{ "id": 1, "key": "q9Wl1v3sNw0pQnVb0tqgJw7mWw2b1m1fRZr1yF3oWQk" }]
```

Never reuse the example value above. Anyone with your sealing key can read and forge session tokens.

**`PAIRWISE_KEY`** derives each supporter's pairwise `supporter.id`. Any long random string works; generate one the
same way. Keep it stable: changing it changes every `supporter.id`, so backends that key users on it would lose
track of them.

## 3. Deploy the API Worker

Edit `app/wrangler.jsonc`:

- Replace the route `api.sponsorkit.io` with your API hostname: `"routes": [{ "pattern":
  "sponsorkit-api.example.com", "custom_domain": true }]`. The Worker has no static assets and needs no other route.
- Set the three `vars` (they are public configuration, not secrets):

  | Var | Example | Meaning |
  |---|---|---|
  | `PUBLIC_ORIGIN` | `https://sponsorkit-api.example.com` | The API origin. The OAuth callback URLs are built from it, so it must match the apps from step 1. |
  | `SITE_BASE_URL` | `https://example.github.io/sponsorkit.io` | Where the site lives (origin plus base path). Sign-in results are delivered to `<SITE_BASE_URL>/connect/done/`, error pages link to its `/connect/` and `/checkout/` pages, and error `type` URLs point to its docs. |
  | `SITE_ORIGIN` | `https://example.github.io` | The only `Origin` the Worker accepts on `POST /api/oauth/:provider/start`. It must be the bare origin of `SITE_BASE_URL`. |

- Optionally rename the Worker (`name`).
- The rate-limit `namespace_id`s only need to be unique within your Cloudflare account.

Trailing slashes are trimmed. If `SITE_ORIGIN` isn't exactly the origin of `SITE_BASE_URL`, sign-in fails closed
with a "Sign-in unavailable" page. When a var is unset, `PUBLIC_ORIGIN` falls back to the request's origin,
`SITE_BASE_URL` to `PUBLIC_ORIGIN`, and `SITE_ORIGIN` to the origin of `SITE_BASE_URL`.

Then set the secrets and deploy:

```bash title="Deploy the API"
# From the repository root
bun install

cd app
bunx wrangler login
bunx wrangler secret put GITHUB_CLIENT_ID
bunx wrangler secret put GITHUB_CLIENT_SECRET
bunx wrangler secret put OPENCOLLECTIVE_CLIENT_ID
bunx wrangler secret put OPENCOLLECTIVE_CLIENT_SECRET
bunx wrangler secret put GITHUB_METADATA_TOKEN
bunx wrangler secret put SEALING_KEYS     # paste the JSON array
bunx wrangler secret put PAIRWISE_KEY
bunx wrangler deploy
```

Check it's running:

```bash
curl https://sponsorkit-api.example.com/api/v1/health
# {"ok":true,"providers":{"github":"ok","opencollective":"ok"}}
```

To change the API hostname later, change the route, `PUBLIC_ORIGIN` and both OAuth apps' callback URLs together.

### Optional settings

| Variable | Purpose |
|---|---|
| `GITHUB_OAUTH_BASE`, `GITHUB_API_BASE` | GitHub URLs (default `https://github.com`, `https://api.github.com`). For tests. |
| `OPENCOLLECTIVE_BASE`, `OPENCOLLECTIVE_API_BASE` | Open Collective URLs (default `https://opencollective.com`, `https://api.opencollective.com`). For tests. |

## 4. Build and host the site

The site is a Next.js static export. Three build-time variables tell it where it lives and where the API is:

| Variable | Official value | Meaning |
|---|---|---|
| `BASE_PATH` | `/sponsorkit.io` | The path the site is served under. Empty (`BASE_PATH=`) for a site at the root of its origin. |
| `SITE_URL` | `https://sponsorkit.github.io/sponsorkit.io` | The absolute site base URL, for canonical URLs, `sitemap.xml` and `robots.txt`. Defaults to `https://sponsorkit.github.io<BASE_PATH>`. |
| `NEXT_PUBLIC_SPONSORKIT_API_BASE` | `https://api.sponsorkit.io` | The API origin the pages call. An empty string means the same origin as the site. |

`TRAILING_SLASH` defaults to `1`: every page is exported as `<path>/index.html` and linked as `<path>/`, which is
what GitHub Pages and most static hosts serve. Build and check:

```bash title="Build the site"
export BASE_PATH=/sponsorkit.io
export SITE_URL=https://example.github.io/sponsorkit.io
export NEXT_PUBLIC_SPONSORKIT_API_BASE=https://sponsorkit-api.example.com
bun run --cwd web build             # static export → web/out
bun run --cwd web docs:check-links  # every internal link resolves under the base path
```

Then publish `web/out` under `SITE_URL`. The export already contains `.nojekyll` (without it GitHub Pages would
drop the `_next/` folder) and a `404.html`.

**On GitHub Pages**, the site is a project site at `https://<owner>.github.io/<repository>`, so `BASE_PATH` is
`/<repository>`, `SITE_ORIGIN` is `https://<owner>.github.io` and `SITE_BASE_URL` is
`https://<owner>.github.io/<repository>`. Enable Pages with *Settings → Pages → Source: GitHub Actions*; the
workflow below builds and deploys it.

:::warning[Every page on the site origin is trusted]
The Worker trusts any page on `SITE_ORIGIN` to start a sign-in. On GitHub Pages, `https://<owner>.github.io` is
shared by the owner's user site and every project site of that account, so only let trusted repositories of that
account publish to Pages. A custom domain for the site (then update `SITE_ORIGIN`, `SITE_BASE_URL`, `BASE_PATH`
and `SITE_URL`) gives it an origin of its own.
:::

The consent pages need no special headers from the host. They set the referrer policy `strict-origin` themselves
(so the browser sends the real `Origin` on the sign-in POST) and hide their provider buttons when they're framed.
Don't serve them with `Referrer-Policy: no-referrer` or `same-origin`: under those policies browsers send
`Origin: null`, and every sign-in start is refused.

### Single origin {#single-origin}

You can serve the site and the API behind one origin, for example `https://sponsors.example.com`, with
`/api/*` going to the Worker and everything else to the static files (a reverse proxy, or a Worker route
`sponsors.example.com/api/*` in front of a static host on the same hostname):

- Build the site at the root with a same-origin API: `SITE_URL=https://sponsors.example.com bun run --cwd web
  build:root` (`build:root` sets `BASE_PATH` and `NEXT_PUBLIC_SPONSORKIT_API_BASE` to empty), then
  `BASE_PATH= SITE_URL=https://sponsors.example.com bun run --cwd web docs:check-links`.
- Set `PUBLIC_ORIGIN`, `SITE_BASE_URL` and `SITE_ORIGIN` to `https://sponsors.example.com`, or leave the
  `SITE_*` vars unset so they follow `PUBLIC_ORIGIN`.
- Register the OAuth callback URLs on that origin.
- In the SDKs, setting `apiBaseUrl` alone is enough: the site defaults to the same URL.

### Deploying from GitHub Actions

The repository's CI workflow (`.github/workflows/ci.yml`) deploys both parts on every push to `main`, after the
tests pass:

- **The site** (`deploy-site` job): the `web` job builds the static export with every language's API reference,
  checks links, runs the end-to-end tests and uploads `web/out` with `actions/upload-pages-artifact`;
  `deploy-site` publishes it with `actions/deploy-pages` (permissions `pages: write` and `id-token: write`,
  environment `github-pages`). The base path and site URL come from the repository's Pages settings. Set the
  repository variable `SPONSORKIT_API_BASE` to your API origin; it defaults to `https://api.sponsorkit.io`. Until
  Pages is enabled (*Source: GitHub Actions*), the job warns and doesn't deploy.
- **The API** (`deploy-api` job): runs `wrangler deploy` in `app/`. To use it in your fork:
  1. Add the repository secrets `CLOUDFLARE_API_TOKEN` (a token that can edit Workers) and `CLOUDFLARE_ACCOUNT_ID`.
  2. Create an environment named `production`.
  3. Set the repository variable `DEPLOY_ENABLED` to `true`.

The Worker secrets from step 3 stay in Cloudflare; the workflow doesn't need them. The Worker vars come from
`app/wrangler.jsonc`, so commit your values there.

### Local development

Run the Worker on `wrangler dev` (`http://localhost:8787`) and the site on the Next.js dev server
(`http://localhost:3000`), at the root, pointing at the local API:

```bash title="Local development"
cp app/.dev.vars.example app/.dev.vars   # fill in your development OAuth apps and keys, and set:
                                         # PUBLIC_ORIGIN=http://localhost:8787
                                         # SITE_BASE_URL=http://localhost:3000
                                         # SITE_ORIGIN=http://localhost:3000
bun run --cwd app dev                    # API on http://localhost:8787
BASE_PATH= NEXT_PUBLIC_SPONSORKIT_API_BASE=http://localhost:8787 bun run --cwd web dev
                                         # site on http://localhost:3000
```

Then point an SDK at it with `apiBaseUrl: "http://localhost:8787"` and `siteBaseUrl: "http://localhost:3000"`.

## Rate limits

The Worker uses Cloudflare's [rate limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
The limits are set in `app/wrangler.jsonc`:

| Binding | Applies to | Default |
|---|---|---|
| `RL_IP` | Everything under `/api/` | 120 per minute per IP |
| `RL_AUTH` | `/api/v1/auth/*` and `/api/oauth/*` | 30 per minute per IP |
| `RL_CONTRIB_IP` | `GET /api/v1/contributions` | 60 per minute per IP |
| `RL_REFRESH` | `GET /api/v1/contributions` | 1 per minute per session |
| `RL_TARGETS_MISS` | Uncached `GET /api/v1/targets` | 20 per minute per IP |
| `RL_TARGETS_MISS_GLOBAL` | Uncached `GET /api/v1/targets` | 60 per minute in total |

A missing binding means no limit, and if a binding fails, requests are allowed (rate limiting is abuse protection,
not a security boundary). The SDKs poll checkout once a minute to match `RL_REFRESH`. If you make it stricter,
clients get more `429`s and serve their cached results more often; they don't fail. See [HTTP API](http-api.md#rate-limits) for how clients see the limits.

## Point the SDKs at your instance

Every SDK takes two base URLs: the API origin (`apiBaseUrl`, used for API calls) and the site base URL
(`siteBaseUrl`, used for the `/connect/` and `/checkout/` pages and for `checkoutUrl()`). With a separate site,
set both:

:::tabs
```ts title="sponsorkit.ts"
import { Sponsorkit } from "@sponsorkit/sdk";

export const sk = new Sponsorkit({
  github: "octocat",
  apiBaseUrl: "https://sponsorkit-api.example.com",
  siteBaseUrl: "https://example.github.io/sponsorkit.io",
});
```
```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "octocat",
    ApiBaseUrl = "https://sponsorkit-api.example.com",
    SiteBaseUrl = "https://example.github.io/sponsorkit.io",
});
Console.WriteLine(sk.ApiBaseUrl);
```
```python title="sponsor.py"
from sponsorkit import Sponsorkit

sk = Sponsorkit(
    github="octocat",
    api_base_url="https://sponsorkit-api.example.com",
    site_base_url="https://example.github.io/sponsorkit.io",
)
```
```go title="main.go"
package main

import (
	"fmt"
	"log"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	sk, err := sponsorkit.New(sponsorkit.Options{
		GitHub:      "octocat",
		APIBaseURL:  "https://sponsorkit-api.example.com",
		SiteBaseURL: "https://example.github.io/sponsorkit.io",
	})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(sk.TargetsParam())
}
```
```rust title="main.rs"
use sponsorkit::{Options, Sponsorkit};

fn main() -> Result<(), sponsorkit::Error> {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        api_base_url: Some("https://sponsorkit-api.example.com".into()),
        site_base_url: Some("https://example.github.io/sponsorkit.io".into()),
        ..Default::default()
    })?;
    println!("{}", sk.targets().param());
    Ok(())
}
```
:::

With a [single origin](#single-origin), pass only `apiBaseUrl`: when `siteBaseUrl` is unset, it defaults to
`apiBaseUrl`. Unset entirely, they default to `https://api.sponsorkit.io` and
`https://sponsorkit.github.io/sponsorkit.io`.

The browser SDK only accepts sign-in messages whose origin is the origin of `siteBaseUrl`, so a wrong
`siteBaseUrl` shows up as a sign-in that never completes.

Use the same values everywhere a client talks to Sponsorkit:

- the `api-base-url` and `site-base-url` attributes of
  [`<sponsorkit-button>` and `<sponsorkit-badge>`](../guides/web-app.md#attributes);
- the API origin option of `verifySession` on your backend (`apiBaseUrl`, `ApiBaseUrl`, `api_base_url`,
  `WithAPIBaseURL`, `VerifyOptions::api_base_url`), see [backend verification](../guides/backend-verification.md#options).
  Backends only call the API, so they need no site URL.

Sessions are sealed with your instance's keys, so a session from the official instance isn't valid on yours, and
the other way round. Switching an app to another instance signs its users out once.

## Rotating keys

To rotate the sealing key without signing anyone out:

1. Generate a new key and put it **first** in `SEALING_KEYS`, keeping the old one after it:
   `[{"id":2,"key":"<new>"},{"id":1,"key":"<old>"}]`. The first key seals; every key unseals.
2. Deploy. Sessions are re-sealed with the new key as they're renewed (once they're more than 7 days old and
   used).
3. After 180 days, every session still sealed with the old key has expired, so remove it.

Each key needs a different `id`, because the id is stored in every sealed value to pick the key for unsealing.

`PAIRWISE_KEY` is different: keep it secret (with it, anyone could link supporter ids to GitHub or Open
Collective accounts), but only replace it if it leaks, because changing it changes every `supporter.id`.
