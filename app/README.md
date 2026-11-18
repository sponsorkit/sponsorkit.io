# @sponsorkit/app — the Sponsorkit Worker

Stateless, API-only Cloudflare Worker (Hono) implementing `docs/PROTOCOL.md` §3 (HTTP API), §4.3–4.4 (provider OAuth) and §5 (sealed values). No database: OAuth state, sign-in codes and sessions are AES-256-GCM sealed blobs.

It runs on its own custom domain (`https://api.sponsorkit.io`) and serves only `/api/v1/*` and `/api/oauth/*`; every other path is a `404 not_found` problem. The site (`web/`: landing, docs, `/connect/`, `/checkout/`, …) is a static export on GitHub Pages (`https://sponsorkit.github.io/sponsorkit.io`), a different site (PROTOCOL §0).

```
src/
  index.ts / app.ts      Worker entry, request id, CORS (/api/v1 only), error handling, 404 for non-API paths
  routes/api.ts          /api/v1/{targets,auth/token,contributions,health}
  routes/oauth.ts        POST /api/oauth/:provider/start (Origin-checked), GET …/callback, delivery (web_message|redirect|loopback|paste)
  seal.ts  payloads.ts   sealing (keyId ‖ nonce ‖ ct+tag, AAD sponsorkit:<kind>:v1) and sealed payload schemas
  pkce.ts  ids.ts        PKCE S256; pairwise supporter ids; contribution ids
  params.ts              §4.1 parameter + redirect_uri/origin/loopback validation
  env.ts                 bindings, PUBLIC_ORIGIN / SITE_BASE_URL / SITE_ORIGIN resolution and validation
  contributions.ts       parallel provider fan-out, partial failure, needsReconnect
  providers/             adapter interface + GitHub (GraphQL v4) and Open Collective (GraphQL v2)
test/                    Vitest (Node): app.fetch with a stubbed global fetch faking both providers
```

## Scripts

| | |
|---|---|
| `bun run test` | Vitest |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run dev` | `wrangler dev` (copy `.dev.vars.example` to `.dev.vars` first and set `PUBLIC_ORIGIN=http://localhost:8787`, `SITE_BASE_URL=http://localhost:3000`, `SITE_ORIGIN=http://localhost:3000`, or the production vars from `wrangler.jsonc` apply; run the site with `BASE_PATH= NEXT_PUBLIC_SPONSORKIT_API_BASE=http://localhost:8787`, see `web/README.md`) |
| `bun run deploy` | `wrangler deploy` |

Secrets are documented in `.dev.vars.example`. Rate-limit bindings (`RL_AUTH`, `RL_REFRESH`, `RL_IP`, `RL_CONTRIB_IP`, `RL_TARGETS_MISS`, `RL_TARGETS_MISS_GLOBAL`) are optional: a missing binding is a no-op.

## Configuration (vars, PROTOCOL §0.1)

| Var | Production (`wrangler.jsonc`) | Meaning | When unset |
|---|---|---|---|
| `PUBLIC_ORIGIN` | `https://api.sponsorkit.io` | API origin; OAuth callback URLs are `<PUBLIC_ORIGIN>/api/oauth/<provider>/callback` | the request's origin |
| `SITE_BASE_URL` | `https://sponsorkit.github.io/sponsorkit.io` | site base URL: `/connect/done/` deliveries, consent links, problem `type` | `PUBLIC_ORIGIN` |
| `SITE_ORIGIN` | `https://sponsorkit.github.io` | the only `Origin` accepted by `POST /api/oauth/:provider/start` | origin of `SITE_BASE_URL` |

Trailing slashes are trimmed. `SITE_ORIGIN` must be the bare origin of `SITE_BASE_URL`; otherwise sign-in fails closed with a 500 "Sign-in unavailable" page. Single-origin self-hosting: put the site and the API behind one origin and leave `SITE_*` unset (or set them to that origin).

The API hostname is the custom-domain route in `wrangler.jsonc`. Changing it means changing the route, `PUBLIC_ORIGIN` and both OAuth apps' callback URLs together.

## Sign-in start (PROTOCOL §4.3)

The consent pages on the site start sign-in with a top-level form POST (`application/x-www-form-urlencoded`, at most 8 KiB, the §4.1 fields plus `continue`) to `/api/oauth/:provider/start`. The Worker:

1. answers any other method (including `GET`/`HEAD` links) with an HTML `405` + `Allow: POST` linking to the consent page;
2. validates the body (HTML `400` otherwise);
3. accepts the start only when `Origin` is exactly `SITE_ORIGIN` and `Sec-Fetch-Dest`, if present, is `document`. Otherwise it returns an HTML `403` linking to `<SITE_BASE_URL>/connect/?…` (or `/checkout/?…` when `continue` is present), with no cookie and no redirect;
4. sets the `__Host-sk_nonce` cookie on the API origin and redirects to the provider with a sealed state.

Deliveries that land on a page go to the site: `<SITE_BASE_URL>/connect/done/#…`.

## Notes

- GitHub OAuth Apps support PKCE (S256) since 2025-07-14, so the Worker sends its own `code_challenge` to both providers. The client secret stays server-side either way.
- The pairwise `supporter.id` is derived from the session's first identity (the original sign-in); adding a second provider keeps it stable.
- `/targets` reports a GitHub account without a Sponsors listing as `exists: false` (it can't be sponsored); display name/avatar are still filled in.
