---
title: JavaScript / TypeScript platform notes
description: Browsers, Node, Bun, Deno and edge runtimes; bundlers, SSR and CommonJS; security headers; and where the SDK stores its state.
sidebar_label: Platform notes
order: 90
---

## Choosing the entry point by runtime

| Where the code runs | Import | Why |
|---|---|---|
| A browser tab (React, Vue, Svelte, plain JS…) | `@sponsorkit/sdk` | Popup sign-in, `localStorage`. |
| A CLI, desktop app or script run by one person | `@sponsorkit/sdk/node` | Loopback or paste-back sign-in, a file in the user's config directory. |
| Your web server, API or edge function | `@sponsorkit/sdk/server` | Verifies tokens your frontend sends; keeps no state. |
| A static HTML page | `@sponsorkit/sdk/elements` | Two custom elements, no code needed. |

The `node` entry point imports `node:http`, `node:fs`, `node:child_process` and `node:readline`, so keep it out
of browser bundles. The other three only use web-standard APIs (`fetch`, Web Crypto, `URL`, `AbortSignal`).

## Modules, bundlers and TypeScript

- The package is ESM-first (`"type": "module"`) with CommonJS builds for every entry point:
  `require("@sponsorkit/sdk/node")` works in CommonJS code. Use one format per app, so you don't load two copies
  (see [Errors](errors.md#handling-errors)).
- Only `@sponsorkit/sdk/elements` has side effects (it registers the custom elements); everything else
  tree-shakes.
- The root entry point reads `process.env.NODE_ENV` literally, so bundlers that replace it (Vite, webpack,
  esbuild, Next.js) turn the dev-time target check on in development builds and off in production.
- Types ship with the package. Both `"moduleResolution": "bundler"` and `"node16"`/`"nodenext"` resolve the
  subpath entry points.

## Browsers

- **Secure context.** The SDK needs Web Crypto (`crypto.subtle`) for PKCE and its storage key, which browsers
  only provide on `https` pages and `http://localhost`. On a plain-`http` page, reads return signed-out results
  and `signIn()` rejects with `invalid_config`.
- **Popups.** Call `signIn()` and `openCheckout()` synchronously from a user gesture. In a sandboxed iframe the
  sandbox needs `allow-popups`. See [Sign-in](sign-in.md#in-the-browser) for the redirect fallback.
- **Cross-Origin-Opener-Policy.** The popup reports back with `postMessage` and the SDK watches `popup.closed`.
  A `Cross-Origin-Opener-Policy: same-origin` header on your page cuts the link to the cross-origin popup, so
  sign-in can't complete. Use `same-origin-allow-popups` (or no COOP header) on pages that sign in.
- **Content Security Policy.** Allow the API origin in `connect-src` (`connect-src https://api.sponsorkit.io`, or
  your `apiBaseUrl`). The popup and checkout pages are on the site (`siteBaseUrl`), which `connect-src` doesn't
  govern. The web components add an inline `<style>` to their shadow root, which a `style-src` policy
  without `'unsafe-inline'` blocks.
- **Several tabs** share one `localStorage` entry, so signing in in one tab signs in all of them (each picks the
  session up on its next call).

### Server-side rendering

Create the browser client only where it runs in the browser: in an effect, an event handler or a client
component. On the server there is no `window` and no `localStorage`; the client would fall back to in-memory
storage and report everyone as signed out. To render something supporter-specific on the server, forward the
session token in a request and call [`verifySession()`](backend-verification.md) there.

```ts title="useSupporter.ts"
import { useEffect, useState } from "react";
import { Sponsorkit } from "@sponsorkit/sdk";

let client: Sponsorkit | undefined;
const getClient = () => (client ??= new Sponsorkit({ github: "octocat", opencollective: "my-collective" }));

export function useIsSupporter(): boolean | undefined {
  const [isSupporter, setIsSupporter] = useState<boolean>();
  useEffect(() => {
    let alive = true;
    void getClient()
      .getFinancialContribution()
      .then((fc) => alive && setIsSupporter(fc.active().length > 0));
    return () => {
      alive = false;
    };
  }, []);
  return isSupporter;
}
```

Create the client once, as above, and reuse it rather than constructing one per render.

## Node, Bun and Deno

- **Node 20 or later.** Bun and Deno run the same `node` entry point through their Node compatibility.
- **Deno permissions.** The native client reads environment variables (`HOME`, `XDG_CONFIG_HOME`, `APPDATA`,
  `SSH_CONNECTION`…), reads and writes its config directory, calls the API, listens on `127.0.0.1` for loopback
  sign-in, and runs `open`/`xdg-open`/`rundll32`. Grant `--allow-env --allow-read --allow-write --allow-net
  --allow-run`, or `-A`.
- **Interactivity.** `nag().due()` only returns `true` when stdout and stderr are both TTYs, so piping your CLI's
  output never prints a nag into a file. Override with the `interactive` option.

## Edge runtimes and serverless

`@sponsorkit/sdk/server` runs anywhere `fetch` does: Cloudflare Workers, Vercel and Netlify functions, Deno
Deploy, Bun and Node servers. Each `verifySession()` call is one HTTP request and keeps no state between
invocations.

## Where state is stored

The client keeps one small JSON document per target set: the session token, the cached result and nag state.
Its key is the `targets_hash`, the hex SHA-256 of the canonical target list (exported as `targetsHash()`), so
apps with different targets never share a session.

| Client | Default location |
|---|---|
| Browser | `localStorage["sponsorkit:<targets_hash>"]`; in memory if `localStorage` is unavailable. |
| Node on Linux | `$XDG_CONFIG_HOME/sponsorkit/<targets_hash>.json`, else `$HOME/.config/sponsorkit/…` |
| Node on macOS | `$HOME/Library/Application Support/sponsorkit/<targets_hash>.json` |
| Node on Windows | `%APPDATA%\sponsorkit\<targets_hash>.json`, else `%USERPROFILE%\AppData\Roaming\sponsorkit\…` |

On Node the directory is created with mode `0700` and the file written with mode `0600`, through a temporary
file and an atomic rename. If no per-user directory can be determined (for example `HOME` is unset), state is
kept in memory for the process; the SDK never writes to the current directory. `defaultStorageDir()` returns the
directory the client would use.

The document has the same format and default location in every Sponsorkit SDK:

```json
{
  "v": 1,
  "sessionToken": "sks_…",
  "cache": { "result": { "signedIn": true, "contributions": [] }, "storedAt": "2026-11-16T18:00:00.000Z" },
  "nags": { "my-cli": { "runs": 3, "lastShown": "2026-11-10T09:00:00.000Z" } }
}
```

Reading never throws: a document or part of one that can't be parsed counts as absent.

### Custom storage

Pass `storage` to keep the state elsewhere. It accepts any Web Storage object (`sessionStorage`, for a session
that ends with the tab) or an object implementing [`SponsorkitStorage`](/docs/reference/js/sdk/sponsorkitstorage):

```ts
import type { SponsorkitStorage } from "@sponsorkit/sdk";
import { Sponsorkit } from "@sponsorkit/sdk/node";

// e.g. an encrypted store provided by your desktop framework
declare const secureStore: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> };

const storage: SponsorkitStorage = {
  read: (hash) => secureStore.get(`sponsorkit:${hash}`),
  write: (hash, json) => secureStore.set(`sponsorkit:${hash}`, json),
};

const sk = new Sponsorkit({ github: "octocat", storage });
```

`write` should replace the value atomically. `memoryStorage()`, `localStorageAdapter()` and, on Node,
`fileStorage(dir)` are the built-in implementations.
