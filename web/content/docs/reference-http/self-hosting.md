---
title: Self-hosting
description: Run your own Sponsorkit as one Cloudflare Worker, with your own OAuth apps, keys and domain, and point every SDK at it.
order: 30
---

Sponsorkit is one stateless Cloudflare Worker plus a set of static pages. There's no database, no cron job and no
migration, so running your own instance means creating two OAuth apps, generating two keys and deploying. You
might do this to control the consent screen's domain, to keep supporter traffic on your own infrastructure, or to
develop Sponsorkit itself.

## What you're deploying

- **The Worker** (`app/`): the HTTP API, provider OAuth and token sealing, written with
  [Hono](https://hono.dev/).
- **The static site** (`web/`): this website, including the `/connect` consent page and the `/checkout` page.
  It's built to `web/out` and served by the Worker as static assets, so page views don't use Worker CPU.

The configuration lives in `app/wrangler.jsonc`. The Worker is written against the Workers runtime (static assets
binding, Workers Cache, rate-limiting bindings). Hono itself also runs on Node.js and Bun, but the repository only
ships the Cloudflare setup.

You need a Cloudflare account (the free plan is enough to start), a domain on it, [Bun](https://bun.sh/), and a
clone of the [repository](https://github.com/sponsorkit/sponsorkit.io). Below, `https://sponsors.example.com`
stands for your domain.

## 1. Create the OAuth apps

Sponsorkit signs supporters in with their own GitHub and Open Collective accounts, so it needs an OAuth app on
each. The callback URL is always your origin plus `/api/oauth/<provider>/callback`.

**GitHub.** Create an **OAuth App** (not a GitHub App) under *Settings → Developer settings → OAuth Apps*:

| Field | Value |
|---|---|
| Homepage URL | `https://sponsors.example.com` |
| Authorization callback URL | `https://sponsors.example.com/api/oauth/github/callback` |

Note the client ID and generate a client secret. Sponsorkit requests the `read:user read:org` scopes, and uses
PKCE on top of the client secret.

**Open Collective.** Create an OAuth application in the developer settings of your Open Collective account, with
the callback URL `https://sponsors.example.com/api/oauth/opencollective/callback`. Note its client ID and secret.
Sponsorkit requests the `orders incognito` scopes, so it can see private ("incognito") contributions to your
targets.

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

## 3. Configure and deploy

Edit `app/wrangler.jsonc`:

- Replace the route `sponsorkit.io` with your hostname: `"routes": [{ "pattern": "sponsors.example.com",
  "custom_domain": true }]`.
- Optionally rename the Worker (`name`).
- The rate-limit `namespace_id`s only need to be unique within your Cloudflare account.

Then build the static pages, set the secrets and deploy:

```bash title="Deploy"
# From the repository root
bun install
bun run --cwd web build          # static pages → web/out

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
curl https://sponsors.example.com/api/v1/health
# {"ok":true,"providers":{"github":"ok","opencollective":"ok"}}
```

### Optional settings

| Variable | Purpose |
|---|---|
| `PUBLIC_ORIGIN` | The origin used to build OAuth callback URLs. Defaults to the origin of each request; set it if the Worker is reachable under more than one hostname. |
| `GITHUB_OAUTH_BASE`, `GITHUB_API_BASE` | GitHub URLs (default `https://github.com`, `https://api.github.com`). For tests. |
| `OPENCOLLECTIVE_BASE`, `OPENCOLLECTIVE_API_BASE` | Open Collective URLs (default `https://opencollective.com`, `https://api.opencollective.com`). For tests. |

### Deploying from GitHub Actions

The repository's CI workflow (`.github/workflows/ci.yml`) has a `deploy` job that builds `web/` and runs
`wrangler deploy` on every push to `main`, after the TypeScript and web jobs pass. To use it in your fork:

1. Add the repository secrets `CLOUDFLARE_API_TOKEN` (a token that can edit Workers) and `CLOUDFLARE_ACCOUNT_ID`.
2. Create an environment named `production`.
3. Set the repository variable `DEPLOY_ENABLED` to `true`.

The Worker secrets from step 3 stay in Cloudflare; the workflow doesn't need them.

### Local development

```bash title="Local development"
cp app/.dev.vars.example app/.dev.vars   # then fill in your development OAuth apps and keys
bun run --cwd web build                  # wrangler dev serves web/out
bun run --cwd app dev                    # http://localhost:8787
```

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

Every SDK takes the API origin (no path) as an option:

:::tabs
```ts title="sponsorkit.ts"
import { Sponsorkit } from "@sponsorkit/sdk";

export const sk = new Sponsorkit({ github: "octocat", apiBaseUrl: "https://sponsors.example.com" });
```
```csharp title="Program.cs"
using Sponsorkit;

var sk = new SponsorkitClient(new SponsorkitOptions
{
    GitHub = "octocat",
    ApiBaseUrl = "https://sponsors.example.com",
});
Console.WriteLine(sk.ApiBaseUrl);
```
```python title="sponsor.py"
from sponsorkit import Sponsorkit

sk = Sponsorkit(github="octocat", api_base_url="https://sponsors.example.com")
```
```go title="main.go"
package main

import (
	"fmt"
	"log"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", APIBaseURL: "https://sponsors.example.com"})
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
        api_base_url: Some("https://sponsors.example.com".into()),
        ..Default::default()
    })?;
    println!("{}", sk.targets().param());
    Ok(())
}
```
:::

Use the same origin everywhere a client talks to Sponsorkit:

- the `api-base-url` attribute of [`<sponsorkit-button>` and `<sponsorkit-badge>`](../guides/web-app.md#attributes);
- the API origin option of `verifySession` on your backend (`apiBaseUrl`, `ApiBaseUrl`, `api_base_url`,
  `WithAPIBaseURL`, `VerifyOptions::api_base_url`), see [backend verification](../guides/backend-verification.md#options).

Sessions are sealed with your instance's keys, so a session from sponsorkit.io isn't valid on your instance, and
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
