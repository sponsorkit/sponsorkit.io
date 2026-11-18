# @sponsorkit/sdk

Build financial contributions into your software. Sponsorkit tells you what the current user has
contributed to your **GitHub Sponsors** and **Open Collective** accounts, and sends them to contribute.
No Sponsorkit account, API key, dashboard or webhook needed.

- Zero runtime dependencies. ESM + CommonJS, with self-contained TypeScript types.
- Browsers (popup or redirect sign-in), Node.js 20+, Bun, Deno and Cloudflare Workers.
- Never breaks your app: network and server problems never throw (served from the local cache).

```sh
npm install @sponsorkit/sdk     # or: bun add / pnpm add / yarn add
```

| Entry point | For | Sign-in | Storage |
|---|---|---|---|
| `@sponsorkit/sdk` | Browsers (and any runtime for mock/offline use) | popup, redirect fallback | `localStorage` |
| `@sponsorkit/sdk/node` | Node, Bun, Deno: CLIs, desktop apps | loopback, paste-back | per-user config dir |
| `@sponsorkit/sdk/server` | Backends, Workers | n/a (`verifySession`) | none |
| `@sponsorkit/sdk/elements` | Plain HTML | `<sponsorkit-button>`, `<sponsorkit-badge>` | `localStorage` |

## Quickstart

### Browser

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-collective" });

const fc = await sk.getFinancialContribution();
if (fc.signedIn && !fc.active().some((c) => c.amount.currency === "USD" && c.amount.value >= 500)) showAd();

// Call these straight from a click handler: the popup opens synchronously.
signInButton.onclick = () => sk.signIn();
sponsorButton.onclick = async () => {
  const r = await sk.openCheckout({ frequency: "monthly", amount: 500 });
  if (r.status === "contributed") thankYou(r.contribution);
};
```

If popups are blocked, `signIn()` rejects with `popup_blocked`, unless you pass `returnTo` (an https or
localhost URL of your app). The page then navigates to Sponsorkit and comes back with
`?sponsorkit_code=…`, which the SDK exchanges automatically on the next call (or call
`sk.handleRedirectCallback()` to observe errors).

### CLI / desktop (Node, Bun, Deno)

```ts
import { Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({ github: "octocat", appName: "my-cli" });

if (process.argv.includes("--sign-in")) await sk.signIn(); // loopback, or paste-back when headless/SSH

const nag = sk.nag({ id: "my-cli", every: 10, orEvery: "P7D" });
if (await nag.due((fc) => fc.active().length === 0)) {
  console.error(`Enjoying my-cli? Support it: ${sk.checkoutUrl({ frequency: "monthly" })}`);
  await nag.shown();
}
```

Native sign-in (`signInMethod: "auto"`, the default) listens on `http://127.0.0.1:<random>/callback` and
opens the system browser (`open`, `xdg-open` or `rundll32`, never through a shell). It uses paste-back
instead when `SSH_CONNECTION` is set, when there is no display, when the browser can't be opened (the
launcher fails to start or exits non-zero; one still running after about 1.5 s counts as opened), or when the
receiver can't bind to `127.0.0.1`: it prints a URL to stderr and reads the code from stdin. The callback is
accepted even while your `openBrowser` is still running. A `/callback` request without a non-empty `code` or
`error` gets a `400` and the receiver keeps waiting.

### Site and API

The pages (`/connect/`, `/checkout/`) live on the Sponsorkit site, `https://sponsorkit.github.io/sponsorkit.io`;
the API lives at `https://api.sponsorkit.io`. To self-host, set `apiBaseUrl`, and `siteBaseUrl` too when your
pages are on a different origin or base path. With `apiBaseUrl` alone the SDK assumes one origin serves both
(`siteBaseUrl` defaults to it). Empty strings count as unset and trailing slashes are trimmed.

```ts
new Sponsorkit({ github: "octocat", apiBaseUrl: "https://api.example.com", siteBaseUrl: "https://example.com/sponsorkit" });
```

> **Paste-back and stdin.** The default stdin prompt can't cancel its blocking read. After a cancelled or
> timed-out paste-back (`signal`, `signInTimeout`), the next line typed may still go to that pending read
> instead of your app. If your app reads stdin itself, pass `promptForCode`.

## API reference

### `new Sponsorkit(options)`

Throws `SponsorkitError{code: "invalid_config"}` when no target is given or a target is malformed.

| Option | Default | |
|---|---|---|
| `github` | – | GitHub user/org login that receives sponsorships. |
| `opencollective` | – | Open Collective collective slug. At least one target is required. |
| `appName` (node) | – | Shown on the consent page as "says it is". Max 64 characters. |
| `cacheTtl` | `3600` | Seconds a cached result is served without calling the API (minimum 60). |
| `mock` | – | Mock mode: a preset name or `{ contributions }` (see below). |
| `storage` | platform | A `SponsorkitStorage` (`{ read(hash), write(hash, json) }`) or a Web Storage object. |
| `storageDir` (node) | per-user config dir | `$XDG_CONFIG_HOME/sponsorkit` (else `$HOME/.config/sponsorkit`), `$HOME/Library/Application Support/sponsorkit`, `%APPDATA%\sponsorkit`. If none can be determined (e.g. `HOME` is unset), state is kept in memory for the process; the SDK never writes to the current directory. |
| `apiBaseUrl` | `https://api.sponsorkit.io` | Origin of the API (every `/api/v1/…` call), for self-hosting or a test server. |
| `siteBaseUrl` | `https://sponsorkit.github.io/sponsorkit.io`, or `apiBaseUrl` when only that is set | Site base URL (origin plus optional base path) for the pages: `<siteBaseUrl>/connect/`, `<siteBaseUrl>/checkout/`, `checkoutUrl()` and the loopback checkout redirect. In the browser, sign-in messages are accepted only from this URL's origin. |
| `signInMethod` (node) | `"auto"` | `"auto" \| "loopback" \| "paste"`. |
| `openBrowser(url)` (node) | system browser | Replace how URLs are opened. |
| `promptForCode(url)` (node) | stdin | Replace how the paste-back code is read. Receives the URL to open. Pass it if your app reads stdin itself (see the paste-back note above). |
| `returnTo` (browser) | – | Redirect fallback when the popup is blocked. |
| `openWindow(url)` (browser) | `window.open` | Replace how the popup is opened (must be synchronous). |
| `env` | `process.env` | Per-instance environment for `SPONSORKIT_DISABLE`, `SPONSORKIT_MOCK`, `SPONSORKIT_NO_NAG`, `SPONSORKIT_DEV_CHECKS` and `CI`. When given, it **replaces** the process environment for these variables (it is not merged). |
| `devChecks` | see note | Check once per process that the targets exist (`GET /api/v1/targets`); throws `invalid_config` on the first async call if not. Default: on when `SPONSORKIT_DEV_CHECKS` is set, or when `process.env.NODE_ENV === "development"`; off otherwise. |
| `signInTimeout` | `300` | Seconds to wait for a popup, loopback or paste-back sign-in before rejecting with `timeout`. |
| `checkoutPollInterval` | `60` | Seconds between checkout polls. |
| `clock` | `Date.now` | Epoch-ms clock for cache TTL, `Retry-After` and nag timing. |
| `fetch` | global `fetch` | Custom fetch. |
| `requestTimeout` | `30` | Seconds before an API request (headers and body) is abandoned: `getFinancialContribution()` then serves the stale cache, `signIn()` and `verifySession()` reject with `network_error`. `0` disables the limit. `verifySession()` takes the same option. |
| `interactive` | TTY detection | Override the nag's stdout/stderr TTY check (browsers count as interactive). |

### Methods

- **`getFinancialContribution({ cacheTtl? })`** → `Promise<FinancialContribution>`. The result shape is identical in every Sponsorkit SDK:

  ```jsonc
  { "signedIn": true, "disabled": false, "mock": false, "targets": ["github:octocat"],
    "supporter": { "id": "sup_…", "identities": [{ "provider": "github", "id": "583231", "handle": "alice", "needsReconnect": false }] },
    "contributions": [{ "id": "con_github_…", "provider": "github", "target": "github:octocat", "status": "active",
                        "kind": "recurring", "frequency": "monthly", "amount": { "value": 500, "currency": "USD" }, "via": "direct", … }],
    "fetchedAt": "2026-11-16T18:00:00Z", "stale": false, "fromCache": false }
  ```

  Helpers filter (they never sum across providers or currencies): `fc.active()`, `fc.recurring()`,
  `fc.oneTime()`, `fc.byProvider("github")`, `fc.direct()` (excludes organization sponsorships).

  Error contract: signed out → signed-out result without a request; `session_invalid` → token and cache are
  cleared and the signed-out result is returned; network errors, 5xx and 429 → the cache with
  `fromCache: true, stale: true` (or a signed-in empty `stale` result), honouring `Retry-After` (values that
  aren't a number of seconds or an HTTP date are ignored, and it is capped at 24 h); a partial
  provider outage → that provider's contributions are filled in from the cache with `stale: true`.
- **`signIn({ provider?, signal? })`** → `Promise<FinancialContribution>`. While signed in, signing in with
  the other provider adds that identity to the session. Rejects with `disabled`, `invalid_config`
  (unconfigured `provider`, or the session couldn't be written to storage), `popup_blocked`, `access_denied`, `invalid_state`, `provider_error`,
  `invalid_code`, `cancelled` (the user closed the popup, entered no code, or `signal` aborted), `timeout`
  (`signInTimeout` passed) or `network_error` (the API couldn't be reached, timed out (`requestTimeout`) or
  failed, including a `400` with a code other than `invalid_code`; `retryAfter` is set when it sent `Retry-After`). If the stored session turned out to be dead while adding an identity, the
  SDK clears it and retries the code once without it. The node entry also accepts `method`.
- **`isSignedIn()`** → `Promise<boolean>` (local only).
- **`getSessionToken()`** → `Promise<string | null>`: the `sks_…` token to forward to your backend (see Backend verification).
- **`openCheckout({ provider?, amount?, currency?, frequency?, timeout? = 600, signal? })`** →
  `Promise<{ status: "contributed", contribution } | { status: "unknown" }>`. Signs in first if needed
  (in the same popup / browser tab), opens `<siteBaseUrl>/checkout/`, then polls with `cacheTtl: 0` until a new or
  changed contribution appears. `timeout` counts from when polling starts; the sign-in phase is bounded by
  `signInTimeout` (and rejects with `timeout` when that passes). Polling timeout and `signal`
  cancellation (in either phase) resolve `{ status: "unknown" }`. `amount` is in minor units (cents).
- **`checkoutUrl({ provider?, amount?, currency?, frequency? })`** → `string`. Synchronous and offline: a
  `<siteBaseUrl>/checkout/?…` link without sign-in, for nags and READMEs. Throws `invalid_config` for an unconfigured
  provider, a frequency other than `one_time`/`monthly`/`yearly`, a non-positive or non-integer amount, or
  a currency that isn't a 3-letter ISO 4217 code.
- **`signOut()`** → deletes the token and cache locally (nag state is kept). Rejects with `invalid_config` if
  the storage can't be written.
- **`nag({ id, every, orEvery? })`** → `{ due(predicate?, { force? }), shown() }` (see below).
- **`Sponsorkit.resetProcessState()`** / **`resetProcessState()`**: forget per-process memo state (tests).

### Errors

Everything thrown is a `SponsorkitError` with a `code` (the same set in every Sponsorkit SDK, also exported
as `SPONSORKIT_ERROR_CODES`):

| Code | When |
|---|---|
| `invalid_config` | Missing/malformed targets or options; a target that doesn't exist (dev-time check); `signIn()` couldn't save the session or `signOut()` couldn't clear it (storage not writable). |
| `disabled` | `signIn()` / `openCheckout()` while `SPONSORKIT_DISABLE` is set. |
| `popup_blocked` | Browser only, without `returnTo`. |
| `access_denied`, `invalid_state`, `provider_error` | The provider or Sponsorkit reported a sign-in error. |
| `invalid_code` | The API rejected the sign-in code exchange (`400 invalid_code`). |
| `cancelled` | Sign-in was abandoned or cancelled: popup closed, no code entered, or `signal` aborted. |
| `timeout` | Sign-in exceeded `signInTimeout`. |
| `network_error` | `signIn()` or `verifySession()` couldn't reach the API, timed out (`requestTimeout`), or got 5xx, 429 or an unexpected response (including a `400` from `/auth/token` with a code other than `invalid_code`). `e.retryAfter` holds the seconds from `Retry-After` when the API sent one (at most 86400). |
| `session_invalid`, `targets_mismatch` | `verifySession()` only. |

`getFinancialContribution()` never throws these network errors; it serves the cache or a `stale` result.

## Nag helper

```ts
const nag = sk.nag({ id: "my-cli", every: 10, orEvery: "P7D" }); // orEvery: ISO-8601 duration or seconds
if (await nag.due((fc) => fc.active().length === 0)) {
  console.error(`❤️ Enjoying my-cli? Support it: ${sk.checkoutUrl({ frequency: "monthly" })}`);
  await nag.shown();
}
```

- The run counter goes up once per process per `id`, on the first `due()` call, even when the predicate is false.
- `due()` returns `predicate(fc) && (runs >= every || since(lastShown) >= orEvery)`. Before the first `shown()`, the `orEvery` clause is false.
- `due()` is always false when `SPONSORKIT_DISABLE`, `SPONSORKIT_NO_NAG` or `CI` is set, or stdout/stderr is
  not a TTY (override with the `interactive` option), unless you pass `{ force: true }` (which never
  overrides `SPONSORKIT_DISABLE`).
- The nag never signs anyone in.

## Mock mode and testing

```ts
new Sponsorkit({ github: "octocat", mock: "active-monthly" });
// presets: signed-out | none | active-monthly | one-time | cancelled | org
new Sponsorkit({ github: "octocat", mock: { contributions: [/* Contribution objects */] } });
```

Or set `SPONSORKIT_MOCK=active-monthly`. Mock mode does no network or disk access and returns `mock: true`;
nag state lives in memory, per instance.
`signIn()` and `openCheckout()` resolve immediately; `openCheckout()` simulates a new contribution.
The `mock` option beats `SPONSORKIT_MOCK`; `SPONSORKIT_DISABLE=1` beats both.

Environment variables (set = non-empty and not `0`/`false`):

| Variable | Effect |
|---|---|
| `SPONSORKIT_DISABLE` | No network or disk access; `disabled: true` results; `signIn`/`openCheckout` reject with `disabled`. |
| `SPONSORKIT_MOCK` | Mock preset name. |
| `SPONSORKIT_NO_NAG` | `nag().due()` returns false. |
| `SPONSORKIT_DEV_CHECKS` | Turns the dev-time target existence check on (unless `devChecks: false`). |
| `CI` | `nag().due()` returns false. |

The `env` option replaces the process environment for all of these.

For integration tests, point `apiBaseUrl` at the conformance fake server
(`bun sdks/conformance/server.ts`; with `apiBaseUrl` alone the site pages come from the same server), pass a temporary `storageDir`, and replace `openBrowser` /
`promptForCode`.

## Web components

```html
<script type="module">
  import { elementDefaults } from "@sponsorkit/sdk/elements";
  // Optional: options for every element-created client, e.g. elementDefaults.returnTo = location.href;
</script>

<sponsorkit-button github="octocat" opencollective="my-collective" amount="500" frequency="monthly">
  Sponsor ♥
</sponsorkit-button>
<sponsorkit-badge github="octocat" opencollective="my-collective"></sponsorkit-badge>
```

- `<sponsorkit-button>` opens checkout (popup, synchronously on click). Attributes: `github`,
  `opencollective`, `amount`, `currency`, `frequency`, `provider`, `api-base-url`, `site-base-url`, `label`.
  Fires `sponsorkit:checkout` (`detail` = checkout result) and `sponsorkit:error`.
- `<sponsorkit-badge>` (attributes `github`, `opencollective`, `api-base-url`, `site-base-url`) shows "Supporter ♥" when `active()` is non-empty and is hidden otherwise. Call
  `badge.refresh()` after signing in.
- Assign `element.client = sk` to share an existing `Sponsorkit` instance.

## Backend verification

Your frontend sends its session token; your backend asks Sponsorkit directly. No key needed: the token
is sealed by Sponsorkit and bound to its target set.

```ts
// Frontend: forward the token with your own API calls.
const token = await sk.getSessionToken(); // null when signed out
await fetch("/api/premium", { method: "POST", headers: token ? { "x-sponsorkit-session": token } : {} });
```

```ts
// Backend (Express-style)
import { SponsorkitError, verifySession } from "@sponsorkit/sdk/server";

app.post("/api/premium", async (req, res) => {
  try {
    const fc = await verifySession(req.get("x-sponsorkit-session") ?? "", { github: "octocat" });
    res.json({ premium: fc.active().length > 0 });
  } catch (e) {
    if (e instanceof SponsorkitError && e.code === "network_error") return res.status(503).end();
    res.status(401).end(); // session_invalid or targets_mismatch
  }
});
```

`verifySession(token, targets, { apiBaseUrl?, fetch?, signal?, requestTimeout? = 30 })` touches no storage and works in
Workers. It throws `session_invalid`, `targets_mismatch` (the token was issued for other targets),
`invalid_config` (malformed `targets` or `requestTimeout`) or `network_error` (unreachable, timed out, 5xx, 429 or an unexpected
response; `retryAfter` holds the seconds from `Retry-After` when the API sent one, e.g. on 429).

## Storage

One JSON document per target set, keyed by `targets_hash` (SHA-256 of the canonical target list):
`<storageDir>/<targets_hash>.json` on native (directory `0700`, file `0600`, written atomically via a
temp file and rename), `localStorage["sponsorkit:<targets_hash>"]` in browsers. It holds the session
token, the cached result and nag state, in the same format every Sponsorkit SDK uses.

Reading never throws: a document that can't be parsed (including invalid UTF-8) counts as absent, and so
does any malformed part of it (a token that isn't `sks_` + printable ASCII, a cache with unexpected types,
a `null` list, a non-object contribution or a bad date, a malformed nag entry). Timestamps are ISO-8601
with a fractional part of any length. A refresh writes its cache and any renewed token back only if the
stored token is still the one it used, and a `401` clears only that token, so concurrent processes don't
clobber each other's sign-in. Background writes (cache, nag counters) that fail are ignored; `signIn()` and
`signOut()` reject with `invalid_config` instead.

## Development

```sh
bun install
bun run --cwd sdks/js typecheck
bun run --cwd sdks/js lint
bun run --cwd sdks/js test        # unit + DOM (happy-dom) + conformance suite against the fake server
bun run --cwd sdks/js test:dist   # build, then smoke-test dist under Node (ESM + CJS), the .d.ts files and the conformance suite
```

## License

MIT
