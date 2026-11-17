---
title: Backend verification in JavaScript / TypeScript
description: Forward the session token from your frontend and check it on your server with verifySession() from @sponsorkit/sdk/server.
sidebar_label: Backend verification
order: 70
---

Anything decided in the browser or on the user's machine can be patched out. For perks that cost you
something, decide on your server: the frontend forwards its session token, and the backend asks Sponsorkit
directly with `verifySession()`. No API key or webhook is involved. The
[backend verification guide](/docs/guides/backend-verification) explains why this is safe.

## Frontend: forward the token

`getSessionToken()` returns the stored `sks_…` token, or `null` when the user is signed out (or in mock mode).
Send it with your own API calls, for example in a header:

```ts title="frontend.ts"
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-collective" });

export async function downloadReport(): Promise<Response> {
  const token = await sk.getSessionToken();
  return fetch("/api/report", { headers: token ? { "x-sponsorkit-session": token } : {} });
}
```

Treat the token like a session cookie: send it only to your own backend over HTTPS, and don't log it.

## Backend: verify it

`@sponsorkit/sdk/server` touches no storage, keeps no state between calls, and only needs `fetch`, so it runs in
Node 20+, Bun, Deno, Cloudflare Workers and other edge runtimes.

```ts title="handler.ts"
import { isSponsorkitError, verifySession } from "@sponsorkit/sdk/server";

const TARGETS = { github: "octocat", opencollective: "my-collective" };

// A fetch-style handler (Workers, Deno, Bun, Hono, Next.js route handlers, …).
export async function handleReport(request: Request): Promise<Response> {
  try {
    const fc = await verifySession(request.headers.get("x-sponsorkit-session") ?? "", TARGETS);
    if (fc.active().length === 0) return new Response("Supporters only", { status: 403 });
    return Response.json({ report: "…" });
  } catch (e) {
    if (isSponsorkitError(e, "network_error")) {
      const headers: Record<string, string> = e.retryAfter === undefined ? {} : { "retry-after": String(e.retryAfter) };
      return new Response("Sponsorkit is unreachable, try again later", { status: 503, headers });
    }
    if (isSponsorkitError(e, "session_invalid") || isSponsorkitError(e, "targets_mismatch")) {
      return new Response("Please sign in again", { status: 401 });
    }
    throw e;
  }
}
```

The same with Express:

```ts title="server.ts"
import express from "express";
import { SponsorkitError, verifySession } from "@sponsorkit/sdk/server";

const app = express();

app.get("/api/report", async (req, res) => {
  try {
    const fc = await verifySession(req.get("x-sponsorkit-session") ?? "", { github: "octocat" });
    res.json({ premium: fc.active().length > 0 });
  } catch (e) {
    if (e instanceof SponsorkitError && e.code === "network_error") return void res.status(503).end();
    res.status(401).end(); // session_invalid or targets_mismatch
  }
});

app.listen(3000);
```

## verifySession()

```ts
function verifySession(
  token: string,
  targets: TargetOptions | string | readonly string[],
  options?: VerifySessionOptions,
): Promise<FinancialContribution>;
```

- `token`: the `sks_…` session token. Surrounding whitespace is ignored; an empty token throws `session_invalid`
  without a request.
- `targets`: your targets, as `{ github, opencollective }`, a target string such as
  `"github:octocat,opencollective:my-collective"`, or a list such as `["github:octocat"]`. They must be the
  same targets your frontend uses: a session is sealed to its target set.
- `options`:

| Option | Type | Default | |
|---|---|---|---|
| `apiBaseUrl` | `string` | `"https://sponsorkit.io"` | API origin (self-hosting, tests). |
| `fetch` | `FetchLike` | global `fetch` | Custom `fetch`. |
| `signal` | `AbortSignal` | none | Aborts the request. |
| `requestTimeout` | `number` | `30` | Seconds before the request is abandoned with `network_error`; `0` disables the limit. |

It resolves to a [`FinancialContribution`](contributions.md#the-result) with live data (never from a cache,
`fromCache: false`), with the same helpers as on the client.

Unlike `getFinancialContribution()`, `verifySession()` **throws** on failure, because a server must not grant
access on stale or missing data:

| Code | When | Typical response |
|---|---|---|
| `session_invalid` | The token is missing, malformed, expired or revoked. | 401: ask the user to sign in again. |
| `targets_mismatch` | The session was issued for a different target set. | 401 |
| `network_error` | Sponsorkit couldn't be reached, timed out, or answered 5xx, 429 or something unexpected. `retryAfter` holds the seconds from `Retry-After` when the API sent one. | 503, or fall back to your own short-lived cache. |
| `invalid_config` | `targets` or `requestTimeout` is malformed. | A bug: fix the call. |

## Caching on the server

`verifySession()` makes one API request per call. If you check the same user on many requests, cache the
outcome per token for a few minutes in your own store, keyed by a hash of the token rather than the token
itself.
