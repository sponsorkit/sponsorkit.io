# Sponsorkit SDK conformance kit

Every Sponsorkit SDK (JS/TS, .NET, Python, Go, Rust) must pass the scenarios in this directory. The kit is language-neutral. It contains:

| Path | What it is |
|---|---|
| `server.ts` | A fake Sponsorkit API (PROTOCOL §3, plus non-interactive `/connect` and `/checkout`), with a control API for scenarios. |
| `scenarios.json` | Every scenario: server setup, SDK steps and exact expected outcomes. **Generated** from `src/scenarios.ts`. |
| `schemas/*.schema.json` | JSON Schemas (2020-12) for `scenarios.json`, the SDK storage file and the control API bodies. Generated. |
| `fixtures/` | Canonical protocol examples, named contributions, target metadata, mock presets and test vectors. |
| `src/runner.ts` | Reference scenario runner. TS/JS SDKs can use it directly; other languages port it (it is short). |
| `test/` | The kit's own tests, including a minimal reference SDK that passes every scenario. |

Normative sources: `docs/PROTOCOL.md` (wire format) and `docs/SPEC.md` (behaviour). Where those leave a detail open, the scenarios pin it down. These clarifications are listed in [Clarifications](#clarifications-made-by-this-kit).

```sh
bun sdks/conformance/server.ts --port 0   # LISTENING 41237
bun run --cwd sdks/conformance test        # the kit's own tests
bun run --cwd sdks/conformance generate    # after editing src/scenarios.ts or src/generate.ts
```

## 1. Starting the fake server from a test suite

```
bun sdks/conformance/server.ts [--port N] [--host 127.0.0.1]
```

- `--port 0` or no `--port` picks a free port.
- When the server is ready it prints exactly one line to stdout: `LISTENING <port>\n`. It prints nothing else to stdout. Diagnostics go to stderr.
- It stops on SIGTERM or SIGINT. If `SPONSORKIT_CONFORMANCE_EXIT_ON_STDIN_EOF=1` is set, it also stops when its stdin closes. Use this so a crashed test runner never leaks the server.
- The base URL is `http://127.0.0.1:<port>`. Pass it to the SDK as `apiBaseUrl`.

Typical harness:

1. Once per test session, spawn the server with `bun` on `PATH`, keeping stdin as a pipe. Read stdout until the first newline and parse `LISTENING (\d+)`.
2. Load `scenarios.json`.
3. For each scenario, run one test in your framework, named after the scenario `id` (§3).
4. When the session ends, kill the process.

Python sketch:

```python
proc = subprocess.Popen(["bun", "sdks/conformance/server.ts"], stdout=PIPE, stdin=PIPE,
                        env={**os.environ, "SPONSORKIT_CONFORMANCE_EXIT_ON_STDIN_EOF": "1"})
port = int(re.fullmatch(r"LISTENING (\d+)\n", proc.stdout.readline().decode())[1])
scenarios = json.load(open("sdks/conformance/scenarios.json"))["scenarios"]

@pytest.mark.parametrize("scenario", scenarios, ids=lambda s: s["id"])
def test_conformance(scenario): run_scenario(scenario, base_url=f"http://127.0.0.1:{port}")
```

Scenarios share one server, so run them **sequentially**.

## 2. The fake server

### 2.1 API (PROTOCOL §3)

The API follows PROTOCOL §3:

- problem+json errors;
- a `Sponsorkit-Request-Id` header on every response;
- CORS headers;
- `Retry-After` on `429` responses.

Its data is deterministic.

- **Targets:** `github:sponsorkit-conformance` and `opencollective:sponsorkit-conformance` exist (`fixtures/targets-response.json`). Any other well-formed account is returned with `exists: false`. The OC collective's currency is EUR. GitHub tiers are $5/$10/$25 monthly and a $10 one-time tier.
- **Identities:** sign-in always yields the same identity per provider:
  - GitHub: `583231` / `conformance-user`;
  - Open Collective: `rvelxbzm-o9n8y05w-wq9op3dg` / `conformance-user`.
- **Contributions:** the default pool is `github-direct-monthly`, `github-org-one-time` and `opencollective-monthly` (`fixtures/contributions.json`). A result contains the pool entries whose provider has an identity in the session and whose target is in the session's target set.
- **Sessions:** `sks_…` tokens are opaque random strings. The server remembers them in memory and they are valid for 180 days. Adding an identity issues a new token. The old one stays valid (stateless renewal semantics).
- **Codes:** `skc_…` tokens are bound to the challenge, target set and delivery. They expire after 60 s, or 600 s for `paste`.
  - At `/auth/token` the server checks `base64url(sha256(codeVerifier)) == challenge` (S256). Otherwise it answers `400 invalid_code`.
  - Codes can be exchanged more than once within their lifetime, like the real Worker.
- **`supporter.id`:** stable per (target set, first identity). Treat it as opaque.

### 2.2 Non-interactive browser pages

The test's `openBrowser(url)` hook does an HTTP GET and **follows redirects**, like a browser without JavaScript.

| Request | Fake behaviour |
|---|---|
| `GET /connect?targets&challenge&delivery&…` | Validates the PROTOCOL §4.1 params and answers `400` (HTML) when they are invalid. `targets` must be **canonical**. `challenge` must be a 43-character base64url S256 challenge. A loopback `redirect_uri` must be exactly `http://127.0.0.1:<port>/callback` or `http://[::1]:<port>/callback`.<br>Then it "signs in" as the `provider` param, else `connect.provider`, else the first target's provider. |
| …`delivery=loopback` | `302` to `<redirect_uri>?code=skc_…`, or `?error=<code>` when `connect.error` is set. |
| …`delivery=paste` | `200 text/plain`. The body is the code followed by `\n`, and the code is also in the `Sponsorkit-Conformance-Code` header. With `connect.error` set, the response is `400` with the body `error: <code>\n`. |
| …`delivery=redirect` | `302` to `<redirect_uri>` with `sponsorkit_code=` (or `sponsorkit_error=`) appended. |
| …`delivery=web_message` | `302` to `/connect/done#code=…&origin=…`, which is a `200` HTML page. |
| `GET /checkout?…` with `challenge`, without `step=choose` | Signs in first, exactly like `/connect`. A paste response also carries `Sponsorkit-Conformance-Continue: /checkout?<params>&step=choose`. |
| `GET /checkout?…` otherwise | Applies PROTOCOL §6 to the fixture targets:<br>• If there is exactly one eligible provider, or `provider` is given and is eligible, it answers `302` to `/__fake/provider/<provider>?to=<real provider URL>`. That page answers `200` and counts as "the user reached the provider's checkout".<br>• If several providers are eligible, it shows a `200` chooser page, unless `checkoutChoice` is set.<br>• If none is eligible, it shows a `200` page with the reasons. |

Every request except `/__control*` is written to the request log.

### 2.3 Control API

All control endpoints take and return JSON.

| Endpoint | Purpose |
|---|---|
| `POST /__control` `{ scenario?, …options }` | **Replaces** the behaviour with: defaults, then the `server` block of scenario `scenario` from `scenarios.json`, then `options`. Resets the counters. Keeps sessions, codes and the log. Unknown scenario ids, unknown options and unknown fixture names → `400`. |
| `PATCH /__control` `{ …options }` | **Merges** options into the current behaviour. A `null` value removes that option. The counters of the options given are reset. Scenario `control` steps use this. |
| `GET /__control` | State: `scenario`, `behaviour`, `counters`, `lastSessionToken`, `issuedSessionTokens` (in issue order, since reset), `lastCode`, `checkoutVisits`, `contributionsCalls`, `lastRequestSeq`. |
| `POST /__control/reset` | Back to a freshly started server: no behaviour, no sessions, no codes, empty log. |
| `GET /__control/requests[?since=<seq>]` | `{ requests: [{ seq, time, requestId, method, path, query, headers, body?, status, responseHeaders }], lastSeq }`.<br>• `headers` holds only `authorization`, `content-type`, `accept`, `user-agent`, `origin` and `sponsorkit-*`.<br>• `body` is parsed JSON when possible.<br>• `responseHeaders` holds `location`, `retry-after` and `sponsorkit-session`. |
| `DELETE /__control/requests` | Clears the log. |
| `GET /__control/codes/latest` | The last issued code record: `{ code, provider, targets, challenge, delivery, redirectUri, origin, issuedAt, expiresAt, via }`. Answers `404` if no code has been issued. `GET /__control/codes` lists all of them. |
| `POST /__control/sessions` `{ targets, identities: ["github", …] }` | Mints a session without sign-in and returns `{ sessionToken, expiresAt }`. |
| `GET /__control/unreachable` | `{ baseUrl }` of a port that refuses connections. Used for "offline" scenarios. |

**Behaviour options** (`schemas/control-options.schema.json`):

| Option | Effect |
|---|---|
| `contributions: (name \| Contribution)[]` | Replaces the contribution pool. Names refer to `fixtures/contributions.json`. |
| `outage: Provider[]` | Those providers "fail upstream". Their contributions are omitted, and results have `stale: true` and `unavailable: [...]`. Only providers that have an identity in the session are listed. |
| `needsReconnect: Provider[]` | Those identities are returned with `needsReconnect: true`. |
| `fail: { status=503, endpoints=["contributions"], times? }` | The listed endpoints answer `5xx internal`. Possible endpoints: `contributions`, `token`, `targets`, `health`. Without `times`, every request fails. |
| `rateLimit: { retryAfter, times? }` | `/contributions` answers `429 rate_limited` with `Retry-After`. Without `times`, every request is limited. |
| `sessionInvalid: true` | Every session token is rejected with `401 session_invalid`, at `/contributions` and as `sessionToken` at `/auth/token`. |
| `renewSession: { times=1 }` | The next `times` successful `/contributions` responses carry `Sponsorkit-Session: <new token>`. |
| `newContribution: { contribution, trigger="checkout", afterCalls=0 }` | Makes a contribution appear in `/contributions`, or replace the one with the same id.<br>• **Arming:** it is armed immediately (`trigger: "immediate"`) or when `/__fake/provider/*` is loaded (`"checkout"`).<br>• **Timing:** once armed, the first `afterCalls` successful `/contributions` responses still omit it; every response after that includes it.<br>• `/auth/token` results never include it. |
| `connect: { provider?, error? }` | Which provider non-interactive sign-in uses, or which error to deliver: `access_denied`, `invalid_state` or `provider_error`. |
| `checkoutChoice: Provider` | Auto-picks this provider when the `/checkout` chooser would be shown. |
| `latencyMs: number` | Delays every `/api/*` response. |

## 3. `scenarios.json`

```jsonc
{
  "version": 1,
  "variables": { "$BASE_URL": "runtime: …", "$TARGETS_HASH": "3363d3…", … },
  "defaults": { "targets": { "github": "sponsorkit-conformance", "opencollective": "sponsorkit-conformance" }, "appName": "conformance-app" },
  "scenarios": [
    {
      "id": "session-renewal", "title": "…", "description": "…", "category": "session",
      "specRefs": ["PROTOCOL §3.3"], "requires": ["openBrowser", "signInMethod", "restart"],
      "server": { "renewSession": { "times": 1 } },
      "steps": [ { "action": "configure", "args": { … } }, { "action": "getFinancialContribution", "args": { "cacheTtl": 0 }, "expect": { … } } ],
      "expect": { "files": [ … ], "requests": { … } }
    }
  ]
}
```

Default values for omitted fields are defined in `schemas/scenarios.schema.json` (e.g. `configure.args.apiBaseUrl` defaults to `"$BASE_URL"`). Apply them when you parse.

### 3.1 Running one scenario

1. `POST /__control/reset`, then `POST /__control {"scenario": "<id>"}`. This applies the scenario's `server` block.
2. Reset the SDK's per-process state (see `restart` below).
3. Pick a fresh `$STORAGE_DIR`: an absolute path whose parent exists but which does **not** exist yet. Fetch `$UNREACHABLE_BASE_URL`. Remember `lastRequestSeq` from `GET /__control`.
4. For each step:
   1. Note `lastRequestSeq`.
   2. Substitute variables in the step's `args`.
   3. Run the step and record its return value or thrown error, and its wall-clock duration.
   4. Substitute variables in `expect` and check it (§3.4).
5. Check the scenario-level `expect`. Its `requests` covers every request since step 3.

Fail the test with every mismatch found.

### 3.2 Variables

These are substituted inside every string. Substitute the longest names first, and expand the constant entries (`$STORAGE_FILE`, `$TARGETS_PARAM`, `$TARGETS_HASH`) before the runtime ones.

| Variable | Value |
|---|---|
| `$BASE_URL` | The fake server's base URL. |
| `$STORAGE_DIR` | The scenario's storage directory (see §3.1). |
| `$STORAGE_FILE` | `$STORAGE_DIR/$TARGETS_HASH.json` |
| `$TARGETS_PARAM`, `$TARGETS_HASH` | The default target set's param and `targets_hash`. Other sets appear as literals. All hashes are in `fixtures/vectors.json`. |
| `$LAST_SESSION_TOKEN` | `GET /__control` → `lastSessionToken`. |
| `$SESSION_TOKEN_<n>` | `GET /__control` → `issuedSessionTokens[n-1]`. Tokens are numbered in issue order: sign-ins, identity additions, renewals and mints. |
| `$MINTED_SESSION_TOKEN` | The token returned by the scenario's most recent `mintSession` step. |
| `$UNREACHABLE_BASE_URL` | `GET /__control/unreachable` → `baseUrl`, fetched once per scenario. |
| `$NOW` | The current UTC time in ISO-8601, taken when the step starts. |

Runtime variables in `args` are read just before the step runs. Those in `expect` are read just after it.

### 3.3 Steps

These are the SDK actions; map each one to your SDK's idiomatic API. Return values are compared as JSON, using PROTOCOL field names (camelCase) and without helper methods.

| `action` | `args` | Run as | Return value compared |
|---|---|---|---|
| `configure` | `github?`, `opencollective?`, `appName?`, `cacheTtl?`, `mock?`, `apiBaseUrl`, `storageDir`, `signInMethod?`, `env`, `devChecks` | Construct a **new** SDK instance, replacing the current one. Pass `env` as the SDK's environment (§4). `devChecks` forces the dev-time target existence check on or off. | — |
| `restart` | — | Drop the instance and reset per-process state (nag run memo, dev-check memo, `Retry-After` memo). Construct a new instance with the last `configure` args. This simulates the next run of the app. | — |
| `signIn` | `method: "loopback" \| "paste"`, `provider?` | `signIn({ provider })` with the sign-in method forced to `method`. | — |
| `isSignedIn` | — | `isSignedIn()` | boolean |
| `getFinancialContribution` | `cacheTtl?` | `getFinancialContribution({ cacheTtl })` | ContributionResult |
| `openCheckout` | `provider?`, `amount?`, `currency?`, `frequency?`, `timeout?` (s), `pollInterval?` (s), `cancelAfter?` (s), `method?` | `openCheckout(...)`. Set the poll interval through the test hook. When `cancelAfter` is set, fire the cancellation signal that many seconds after the call starts. When `method` is set, it forces the sign-in method. | `{ status, contribution? }` |
| `checkoutUrl` | `provider?`, `amount?`, `currency?`, `frequency?` | `checkoutUrl(...)` | string |
| `signOut` | — | `signOut()` | — |
| `nagDue` | `id`, `every`, `orEvery?`, `predicate`, `force` | `nag({ id, every, orEvery }).due(predicate, { force })`. `predicate` is one of:<br>• `always`: `fc => true`<br>• `never`: `fc => false`<br>• `noActive`: `fc => fc.active().length === 0` | boolean |
| `nagShown` | `id` | `nag({ id, … }).shown()` | — |
| `verifySession` | `token`, `targets` | Server helper: `verifySession(token, targets)`, with `apiBaseUrl` = `$BASE_URL`. | ContributionResult |
| `control` | behaviour options (nullable) | `PATCH /__control` | — |
| `mintSession` | `targets`, `identities` | `POST /__control/sessions`. Sets `$MINTED_SESSION_TOKEN`. | — |
| `writeStorage` | `path` (default `$STORAGE_FILE`), `json` | Create the parent directory (`0700`) and write `json` to the file (`0600`). This simulates a file written by another SDK. | — |
| `wait` | `seconds` | Sleep. | — |
| `parallel` | `instances`, `step` | Construct `instances` new SDK instances from the last `configure` args and run `step` on all of them concurrently. | — |
| `group` | `steps` | Run the steps in order and stop at the first error. The group's `expect.throws` must match that error. | — |

### 3.4 Expectations

Step-level `expect`:

- **`throws: <code>`:** the step must throw or reject with a SponsorkitError of that `code`. If a step has no `throws`, **any** error fails the test.
- **`returns`:** a matcher (§3.5) applied to the normalized return value.
- **`contributionIds`:** an unordered set. It must equal the ids of `returns.contributions`, or of `returns.contribution` for `openCheckout`.
- **`requests`:** checks the requests the server logged while this step ran (§3.6).
- **`minSeconds` / `maxSeconds`:** bounds on the step's wall-clock duration.

Scenario-level `expect`:

- **`requests`:** like the step-level check, but over the whole scenario.
- **`files`:** each entry is one of:
  - `{ path, exists, kind?, mode?, json?, schema? }`. `exists` is `true`, `false` or `"optional"`; with `"optional"`, the other checks apply only if the file exists. `mode` is a POSIX octal string such as `"0600"` and is skipped on Windows. `json` is a matcher on the parsed content. `schema: "storage-file"` means the file must validate against `schemas/storage-file.schema.json`.
  - `{ glob, count }`. Only `*` is supported, and only in the last path segment. Example: `"$STORAGE_DIR/*.tmp"` with `count: 0` means no temp files are left behind.

### 3.5 Matchers

A matcher is plain JSON with a few `$` operators:

- **Objects** match as a **subset**: every expected key must match, and extra actual keys are ignored.
- **Arrays** must have the same length and match element-wise.
- **Scalars** must be equal.

| Operator | Meaning |
|---|---|
| `{"$exact": v}` | Deep equality with no subset rule. Keys whose value is `undefined` are ignored. |
| `{"$absent": true}` | The value is missing **or `null`**. |
| `{"$any": true}` | The value is present, and may be `null`. |
| `{"$regex": "…"}` | A string matching the pattern. Patterns use only syntax common to ECMAScript, .NET, Python, Go RE2 and Rust `regex`. |
| `{"$type": t}` | `t` is one of `string`, `number`, `integer`, `boolean`, `null`, `object`, `array`, or `datetime` (an ISO-8601 date-time with `Z` or an offset). |
| `{"$len": n}` | An array or string of length `n`. |
| `{"$oneOf": [m…]}` | Any of the given matchers matches. |
| `{"$keys": [k…]}` | Exactly this key set. |
| `{"$url": {"base": "…", "query": m}}` | Parses a URL. `scheme://host[:port]/path` must equal `base`, and `query` is matched against the decoded query parameters as an object. Use `{"$exact": …}` inside `query` to require exactly those parameters. |

`src/matcher.ts` is the reference implementation (about 100 lines).

### 3.6 Request expectations

```jsonc
"requests": { "exact": true, "includeTargetsLookups": false, "calls": [
  { "method": "GET", "path": "/api/v1/contributions", "count": 1, "headers": { "authorization": "Bearer $SESSION_TOKEN_1" } }
] }
```

- **Matching a call:** each `calls[i]` matches log entries with the same `method` and `path` whose `query`, `headers` and `body` match the given matchers.
- **Counting:** `count`, `min` and `max` bound the number of matching entries. With none of them, at least 1 is required.
- **`exact`** (default `true`): every log entry must be matched by some call.
- **`includeTargetsLookups`** (default `false`): when false, `GET /api/v1/targets` entries are ignored completely, because dev-time existence checks may happen at any time. When true, they count like any other request. This is how "no network at all" is asserted:

  ```json
  { "exact": true, "includeTargetsLookups": true, "calls": [] }
  ```

## 4. Required SDK test hooks

PROTOCOL §7 lists `apiBaseUrl`, `openBrowser`, `promptForCode`, `storageDir`/`storage`, `clock` and `signInMethod`. The scenarios declare the hooks they need in `requires`:

| Hook | Requirement |
|---|---|
| `apiBaseUrl` | Every request goes to this origin. |
| `storageDir` | The SDK uses this directory as is. The SDK **creates** it (mode `0700`) when it first writes. |
| `openBrowser(url)` | The harness replaces it with an HTTP GET that follows redirects. For loopback flows the SDK's own loopback server must already be listening when the call happens, because the redirect chain reaches it. |
| `promptForCode(url)` | The harness GETs the paste URL, the way a user would open it, and returns the code from the response (the body, or the `Sponsorkit-Conformance-Code` header). **The harness needs the paste URL.** The SDK should pass it as an argument; otherwise the harness parses it from the SDK's stderr. |
| `signInMethod` | Forces `loopback` or `paste`. |
| `env` | Environment variables the SDK reads (`SPONSORKIT_DISABLE`, `SPONSORKIT_MOCK`, `SPONSORKIT_NO_NAG`, `CI`) must be injectable per instance. Alternatively, the harness can set the process environment around the step. A variable counts as **set** when it is non-empty and not `0` or `false`, case-insensitively. |
| `devChecks` | A way to force the dev-time `/targets` existence check on or off, whatever build-mode detection would decide. |
| `checkoutPollInterval` | A way to poll faster than every 60 s. The `clock` hook works too, if the SDK has one. |
| `restart` | A way to reset per-process memo state: the nag run-counted set, the dev-check memo and the `Retry-After` memo. |
| `posixPermissions` | Only checked on POSIX. |

Also needed: the cancellation primitive of `openCheckout` (`AbortSignal`, `CancellationToken`, `context.Context`, …), and access to `SponsorkitError.code`.

Error codes asserted by `throws`:

- `invalid_config`
- `disabled`
- `access_denied`, `invalid_state`, `provider_error` (the code delivered to the loopback callback)
- `session_invalid` (only from `verifySession`)
- `targets_mismatch` (only from `verifySession`)

## 5. Fixtures

| File | Content |
|---|---|
| `targets-response.json`, `targets-response.missing.json` | `TargetsResponse` for the default target set, and for a target that doesn't exist. |
| `contributions.json` | The named `Contribution`s and the default pool. |
| `contribution-result*.json` | Results: a full result (exactly what the fake returns for a session with both identities, apart from `fetchedAt`), a partial outage, signed-out and disabled. |
| `token-response.json` | A `TokenResponse` example. |
| `problem.*.json` | problem+json examples. |
| `storage-file.json` | A PROTOCOL §8 storage file. |
| `mock-presets.json` | The SPEC §7.4 presets and their expansion rules. **Every SDK embeds this data identically** and expands it with the `rules` (reference: `src/mock-presets.ts`). The `mock-*` scenarios pin the expanded results. |
| `vectors.json` | Test vectors for `targets_hash`, invalid targets, PKCE (including RFC 7636 appendix B) and contribution ids. |

All fixtures are validated against `@sponsorkit/shared` in `test/fixtures.test.ts`.

## 6. Clarifications made by this kit

The specs leave the following open. The scenarios decide them as below. They should be folded back into PROTOCOL/SPEC.

1. **Sign-in caches the token result.** After `/auth/token`, the SDK stores `result` as its cache, with `storedAt` set to the time of the exchange. The next `getFinancialContribution()` within `cacheTtl` therefore makes no request.
2. **Fresh cache hits** return `fromCache: true`, and `stale` keeps its cached value.
3. **Offline, 5xx or 429 without a cache:**

   ```
   { signedIn: true, supporter: null, contributions: [], fetchedAt: null, stale: true, fromCache: false }
   ```

   The token is kept.
4. **`Retry-After` is honoured per process.** While it is in force, even `cacheTtl: 0` serves the cache without a request.
5. **Partial outage:** the API's contributions are merged with the cached contributions of the `unavailable` providers. The result has `stale: true` and `fromCache: false`.
6. **Sign-out** keeps nag state. It deletes `sessionToken` and `cache`, or the whole file.
7. **Adding an identity:** `signIn` while signed in sends `add=1` and passes the stored `sessionToken` to `/auth/token`.
8. **Sign-in errors** delivered to the loopback callback reject `signIn` with that code: `access_denied`, `invalid_state` or `provider_error`.
9. **Checkout:**
   - When already signed in, the `/checkout` URL carries no `challenge`.
   - The baseline for detection is the result the SDK already holds: the cache, or the token result.
   - A *changed* contribution (same id, different content) counts as detected.
   - Cancellation resolves `{ status: "unknown" }`. It does not throw.
   - The loopback redirect after sign-in goes to `<apiBaseUrl>/checkout?<checkout params>&step=choose`.
10. **Nag:**
    - `lastShown: null` makes the `orEvery` clause false.
    - `force: true` bypasses the TTY, `CI` and `SPONSORKIT_NO_NAG` checks, but not `SPONSORKIT_DISABLE`.
    - Runs are counted even when the predicate is false.
11. **Precedence:**
    - `SPONSORKIT_DISABLE` beats mock.
    - The `mock` option beats `SPONSORKIT_MOCK`.
    - In disabled mode, malformed targets still throw `invalid_config` (no I/O is needed for that check).
12. **`verifySession`** compares the canonical target param. It throws `targets_mismatch` or `session_invalid`, and touches no storage.
