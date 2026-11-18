# @sponsorkit/web

The static site, deployed to GitHub Pages as a project site at https://sponsorkit.github.io/sponsorkit.io:
landing page, docs, 404, and the supporter pages `/connect/`, `/connect/done/`, `/checkout/` and
`/checkout/thanks/` (PROTOCOL §0, §4.2, §4.5, §4.6, §6). Next.js App Router with `output: "export"`;
there is no server rendering at runtime. The pages call the API (the Worker in `app/`, default
https://api.sponsorkit.io) with CORS `fetch`, and start sign-in with a top-level form POST to
`<API>/api/oauth/<provider>/start` (PROTOCOL §4.3).

## Build settings

Read by `next.config.ts`, `scripts/check-links.ts` and the tests from `site-config.ts`; the defaults are the
production values (PROTOCOL §0.2):

| Variable | Default | Meaning |
|---|---|---|
| `BASE_PATH` | `/sponsorkit.io` | Next.js `basePath`. `BASE_PATH=` (empty) builds at the root. |
| `TRAILING_SLASH` | `1` | Pages export as `x/index.html` and link as `x/`. `0` turns it off. |
| `SITE_URL` | `https://sponsorkit.github.io<BASE_PATH>` | Absolute site base URL for canonical URLs, `og:url`, `sitemap.xml` and `robots.txt`. |
| `NEXT_PUBLIC_SPONSORKIT_API_BASE` | `https://api.sponsorkit.io` | API origin. Empty = same origin (`/api/…`). |

- **Single-origin self-hosting** (site and API behind one origin, at its root):
  `SITE_URL=https://sponsors.example.com bun run build:root` (`build:root` sets `BASE_PATH=` and
  `NEXT_PUBLIC_SPONSORKIT_API_BASE=`), then `BASE_PATH= SITE_URL=… bun run docs:check-links`, and serve
  `web/out` and the Worker's `/api/*` from the same origin (Worker vars: `SITE_ORIGIN` = that origin).
- **Local Worker** (same recipe as the self-hosting docs, "Local development"): in `app/.dev.vars` set all three
  Worker vars, otherwise the production values from `app/wrangler.jsonc` apply and sign-in fails:
  `PUBLIC_ORIGIN=http://localhost:8787`, `SITE_BASE_URL=http://localhost:3000`, `SITE_ORIGIN=http://localhost:3000`.
  Run `bun run --cwd app dev`, then the site at the root with
  `BASE_PATH= NEXT_PUBLIC_SPONSORKIT_API_BASE=http://localhost:8787 bun run dev` and open http://localhost:3000/.
  - The API base must use the same host as `PUBLIC_ORIGIN` (`localhost`, not `127.0.0.1`): the `__Host-sk_nonce`
    cookie is set on the host the form POST goes to, and the provider callback lands on `PUBLIC_ORIGIN`.
  - `SITE_BASE_URL` must include the dev server's base path. To keep the default base path instead, drop
    `BASE_PATH=`, set `SITE_BASE_URL=http://localhost:3000/sponsorkit.io` and open http://localhost:3000/sponsorkit.io/.
- The export includes `.nojekyll` (GitHub Pages would otherwise drop `_next/`), `robots.txt`, `sitemap.xml`
  and `404.html`; `docs:check-links` fails if one is missing.

| Script | What it does |
|---|---|
| `bun run dev` | Dev server (under the base path; `BASE_PATH=` for the root). To talk to a local Worker, see **Local Worker** above. |
| `bun run build` | Static export to `web/out` for GitHub Pages (renders `content/docs` and any generated reference in `.generated/reference`). |
| `bun run build:root` | The same at the root with a same-origin API, for single-origin self-hosting. |
| `bun run docs:generate [--strict] [--no-stubs] [--only <lang>[,…]]` | Runs `sdks/<lang>/scripts/gen-docs.sh` for each SDK, validates the output and moves it to `.generated/reference/<lang>`. |
| `bun run docs:validate <lang> [--dir <folder>]` | Validates a generator's output against the reference contract (no `next build`). |
| `bun run docs:check-links` | After a build: every internal link and `#anchor` in `web/out` (and `search-index.json`, `sitemap.xml`, canonical URLs) resolves under the base path. |
| `bun run serve` | Serves `web/out` on `127.0.0.1:4173/sponsorkit.io/` like GitHub Pages (`--base ""` for a root build). |
| `bun run test` | Vitest unit tests (`src/lib`: query parsing, eligibility, URLs, fragment handling; `src/lib/docs`: Markdown pipeline, navigation, search, link checking, reference validation, the real content tree). |
| `bun run test:e2e` | Builds, checks links, then runs Playwright against `web/out` served under the base path, with the API origin (`/api/v1/*`, `/api/oauth/*`) mocked. |
| `bun run typecheck` | `next typegen` + `tsc`. |

- `src/lib/params.ts`: §4.1 query validation, consent "who is asking", the sign-in start form and `continue`.
- `src/lib/site.ts`: base path, site URL and page paths (trailing-slash form).
- `src/lib/checkout.ts`: §6 eligibility, GitHub tier choice and provider redirect URLs (pure).
- `src/lib/done.ts`: `/connect/done/` fragment parsing.
- The pages that start sign-in use referrer policy `strict-origin` (so the POST carries the site's `Origin`) and
  hide the provider buttons when framed (PROTOCOL §4.1).
- Code samples are highlighted at build time with Shiki.

## Docs

- Content: `content/docs/**.md` (authoring guide and ownership: `content/docs/CONTRIBUTING-DOCS.md`).
- Generated API reference: `.generated/reference/<lang>/` (gitignored; contract: `content/docs/REFERENCE-CONTRACT.md`).
  Missing languages render a placeholder; `DOCS_STRICT=1` makes them a build error.
- Pipeline: `src/lib/docs` (loader + nav in `site.ts`, Markdown in `markdown.ts`, search in `search-*.ts`), rendered by
  `src/app/(docs)/docs/[[...slug]]/page.tsx`; `/search-index.json` comes from `src/app/search-index.json/route.ts`.
