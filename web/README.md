# @sponsorkit/web

The static site served by the Worker from `web/out`: landing page, docs, and the supporter pages
`/connect`, `/connect/done`, `/checkout` and `/checkout/thanks` (PROTOCOL §4.2, §4.5, §4.6, §6).
Next.js App Router with `output: "export"`; there is no server rendering at runtime.

| Script | What it does |
|---|---|
| `bun run dev` | Dev server. Set `NEXT_PUBLIC_SPONSORKIT_API_BASE=http://127.0.0.1:8787` to talk to a local Worker. |
| `bun run build` | Static export to `web/out` (renders `content/docs` and any generated reference in `.generated/reference`). |
| `bun run docs:generate [--strict] [--no-stubs] [--only <lang>[,…]]` | Runs `sdks/<lang>/scripts/gen-docs.sh` for each SDK, validates the output and moves it to `.generated/reference/<lang>`. |
| `bun run docs:validate <lang> [--dir <folder>]` | Validates a generator's output against the reference contract (no `next build`). |
| `bun run docs:check-links` | After a build: every internal link and `#anchor` in `web/out` (and `search-index.json`) resolves. |
| `bun run serve` | Serves `web/out` on `127.0.0.1:4173` with the same HTML resolution as Workers assets. |
| `bun run test` | Vitest unit tests (`src/lib`: query parsing, eligibility, URLs, fragment handling; `src/lib/docs`: Markdown pipeline, navigation, search, link checking, reference validation, the real content tree). |
| `bun run test:e2e` | Builds, checks links, then runs Playwright against `web/out` with `/api/v1/*` mocked. |
| `bun run typecheck` | `next typegen` + `tsc`. |

- `src/lib/params.ts`: §4.1 query validation, consent "who is asking", start URL and `continue`.
- `src/lib/checkout.ts`: §6 eligibility, GitHub tier choice and provider redirect URLs (pure).
- `src/lib/done.ts`: `/connect/done` fragment parsing.
- Code samples are highlighted at build time with Shiki.

## Docs

- Content: `content/docs/**.md` (authoring guide and ownership: `content/docs/CONTRIBUTING-DOCS.md`).
- Generated API reference: `.generated/reference/<lang>/` (gitignored; contract: `content/docs/REFERENCE-CONTRACT.md`).
  Missing languages render a placeholder; `DOCS_STRICT=1` makes them a build error.
- Pipeline: `src/lib/docs` (loader + nav in `site.ts`, Markdown in `markdown.ts`, search in `search-*.ts`), rendered by
  `src/app/(docs)/docs/[[...slug]]/page.tsx`; `/search-index.json` comes from `src/app/search-index.json/route.ts`.
- Sub-path hosting (e.g. GitHub Pages project sites): `BASE_PATH=/sponsorkit.io TRAILING_SLASH=1 bun run build`, then
  `BASE_PATH=/sponsorkit.io bun run docs:check-links`. The supporter pages (`/connect`, `/checkout`) need the Worker's
  API and only work when served by it.
