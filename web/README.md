# @sponsorkit/web

The static site served by the Worker from `web/out`: landing page, docs, and the supporter pages
`/connect`, `/connect/done`, `/checkout` and `/checkout/thanks` (PROTOCOL §4.2, §4.5, §4.6, §6).
Next.js App Router with `output: "export"`; there is no server rendering at runtime.

| Script | What it does |
|---|---|
| `bun run dev` | Dev server. Set `NEXT_PUBLIC_SPONSORKIT_API_BASE=http://127.0.0.1:8787` to talk to a local Worker. |
| `bun run build` | Static export to `web/out`. |
| `bun run serve` | Serves `web/out` on `127.0.0.1:4173` with the same HTML resolution as Workers assets. |
| `bun run test` | Vitest unit tests (`src/lib`: query parsing, eligibility, URLs, fragment handling). |
| `bun run test:e2e` | Builds, then runs Playwright against `web/out` with `/api/v1/*` mocked. |
| `bun run typecheck` | `next typegen` + `tsc`. |

- `src/lib/params.ts`: §4.1 query validation, consent "who is asking", start URL and `continue`.
- `src/lib/checkout.ts`: §6 eligibility, GitHub tier choice and provider redirect URLs (pure).
- `src/lib/done.ts`: `/connect/done` fragment parsing.
- Code samples are highlighted at build time with Shiki, so the landing page and docs ship no extra client JS.
