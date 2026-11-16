# @sponsorkit/app — the Sponsorkit Worker

Stateless Cloudflare Worker (Hono) implementing `docs/PROTOCOL.md` §3 (HTTP API), §4.3–4.4 (provider OAuth) and §5 (sealed values). No database: OAuth state, sign-in codes and sessions are AES-256-GCM sealed blobs.

```
src/
  index.ts / app.ts      Worker entry, request id, CORS, error handling, ASSETS fallback
  routes/api.ts          /api/v1/{targets,auth/token,contributions,health}
  routes/oauth.ts        /api/oauth/:provider/{start,callback}, delivery (web_message|redirect|loopback|paste)
  seal.ts  payloads.ts   sealing (keyId ‖ nonce ‖ ct+tag, AAD sponsorkit:<kind>:v1) and sealed payload schemas
  pkce.ts  ids.ts        PKCE S256; pairwise supporter ids; contribution ids
  params.ts              §4.1 parameter + redirect_uri/origin/loopback validation
  contributions.ts       parallel provider fan-out, partial failure, needsReconnect
  providers/             adapter interface + GitHub (GraphQL v4) and Open Collective (GraphQL v2)
test/                    Vitest (Node): app.fetch with a stubbed global fetch faking both providers
```

## Scripts

| | |
|---|---|
| `bun run test` | Vitest |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run dev` | `wrangler dev` (copy `.dev.vars.example` to `.dev.vars` first; needs `../web/out` to exist) |
| `bun run deploy` | `wrangler deploy` |

Secrets are documented in `.dev.vars.example`. Rate-limit bindings (`RL_AUTH`, `RL_REFRESH`, `RL_IP`, `RL_CONTRIB_IP`, `RL_TARGETS_MISS`, `RL_TARGETS_MISS_GLOBAL`) are optional: a missing binding is a no-op.

## Notes

- GitHub OAuth Apps support PKCE (S256) since 2025-07-14, so the Worker sends its own `code_challenge` to both providers. The client secret stays server-side either way.
- The pairwise `supporter.id` is derived from the session's first identity (the original sign-in); adding a second provider keeps it stable.
- `/targets` reports a GitHub account without a Sponsors listing as `exists: false` (it can't be sponsored); display name/avatar are still filled in.
