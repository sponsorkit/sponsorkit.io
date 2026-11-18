# Cross-origin e2e test (split deployment)

A real end-to-end test of the GitHub Pages site + API-only Worker split (PROTOCOL §0, §4; SPEC D16, D17).
Everything runs locally on four loopback origins, three of them different sites:

| Part | URL | Runs |
|---|---|---|
| API | `http://localhost:28787` | `wrangler dev` on `app/src`, config generated from `app/wrangler.jsonc` |
| Site | `http://127.0.0.2:28788/sponsorkit.io/` | the `web/` static export (`BASE_PATH=/sponsorkit.io`, `TRAILING_SLASH=1`, `NEXT_PUBLIC_SPONSORKIT_API_BASE=<API>`) behind a GitHub Pages-like server |
| App | `http://127.0.0.1:28789/` | a third-party page that loads `sdks/js/dist` with `apiBaseUrl` + `siteBaseUrl` |
| Fake providers | `http://127.0.0.3:28790` | fake GitHub / Open Collective OAuth (with PKCE checks) and GraphQL (`lib/fake-providers.mjs`) |

Setup: `e2e` is a root workspace with its own devDependencies (`playwright` pinned to web/'s version, `wrangler`), so a
plain `bun install` at the repo root is enough; then `bun run --cwd e2e install:browsers` once for Chromium.
Nothing is resolved from a global `NODE_PATH` (`test/deps.test.mjs` checks this).

```sh
bun run --cwd e2e test        # builds the SDK and the site, then runs the tests (~1 min)
bun run --cwd e2e test:only   # reuse the last build
bun run --cwd e2e stack       # start everything and keep it running, for manual poking
```

What it checks (`test/split.test.mjs`), driving headless Chromium with Playwright:

- **SDK sign-in**: app button → `signIn()` popup on the site's `/connect/` → consent → top-level form POST to the API
  `/api/oauth/github/start` (Origin = site origin, `__Host-sk_nonce` set on the API) → fake authorize → API callback →
  the site's `/connect/done/` posts the code to the app → SDK exchanges it → `getFinancialContribution()` shows the fake
  sponsorship; then adds an Open Collective identity (`add=1`).
- **Protocol without the SDK**: the same flow driven by hand, to tell site/API problems from SDK problems.
- **Checkout**: `openCheckout()` signs in inside `/checkout/`, continues to `/checkout/?…&step=choose`, redirects to the
  GitHub tier URL (github.com and opencollective.com are stubbed with Playwright routes), and the SDK's polling sees the
  new sponsorship. `checkoutUrl()` → Open Collective donate URL with `redirect=<site>/checkout/thanks/`.
- **Consent can't be skipped**: a cross-site form POST from the app → 403, a `fetch` POST → no cookie, a GET link → 405
  (`Allow: POST`), a framed consent page shows no buttons and a framed submit → 403; never a cookie or a provider hit.
- **API only**: problem+json 404 outside `/api/*` with the site's problem `type`, CORS only on `/api/v1/*`, exact Origin match.

Everything generated (site export, `wrangler.json`, `.dev.vars` with random sealing keys, wrangler state) lives in
`e2e/.cache/`. The site build runs `next build` in `web/` and moves the export to `e2e/.cache/site`; an existing
`web/out` is restored afterwards. `RL_REFRESH` is dropped from the Worker config so checkout polling isn't throttled.

Environment: `E2E_SKIP_BUILD=1` reuses existing builds, `E2E_SDK_DIST=<dir>` tests another SDK build, `E2E_VERBOSE=1`
prints wrangler's output, `E2E_*_PORT` / `E2E_*_HOST` move the servers (see `lib/config.mjs`).
