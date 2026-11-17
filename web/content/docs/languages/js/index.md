---
title: Sponsorkit for JavaScript / TypeScript
description: Install and use @sponsorkit/sdk in browsers, Node.js, Bun, Deno and Cloudflare Workers.
sidebar_label: Overview
---

`@sponsorkit/sdk` tells your app what the current user has contributed to your GitHub Sponsors and Open
Collective accounts, and sends them to contribute. It is written in TypeScript, ships ESM and CommonJS builds
with self-contained type declarations, and has no runtime dependencies.

## Requirements

| Runtime | Supported | Notes |
|---|---|---|
| Browsers | Evergreen browsers | Needs `fetch`, Web Crypto (`crypto.subtle`, so a secure context: https or `localhost`) and `localStorage` (falls back to memory). |
| Node.js | 20 or later | `engines.node` is `>=20`. |
| Bun | Current releases | Uses the `node` entry point. |
| Deno | Via `npm:` specifiers | Uses the `node` entry point for CLIs, the root entry point for web code. |
| Cloudflare Workers and other edge runtimes | Yes | Use `@sponsorkit/sdk/server` for backend verification. |

TypeScript users need nothing extra: the type declarations are part of the package (`.d.ts` for ESM, `.d.cts`
for CommonJS) and work with `moduleResolution` set to `bundler`, `node16` or `nodenext`.

## Install

:::warning[Not on npm yet]
`@sponsorkit/sdk` hasn't been published to npm yet, and the name may not be reserved, so a package someone else
publishes under it would not be this project. Until the first release is announced, build the SDK from the
repository and install the tarball. Building needs [Bun](https://bun.sh).
:::

```bash title="Terminal"
git clone https://github.com/sponsorkit/sponsorkit.io.git
(cd sponsorkit.io && bun install && bun run --cwd sdks/js build && cd sdks/js && npm pack)
npm install ./sponsorkit.io/sdks/js/sponsorkit-sdk-0.1.0.tgz
```

pnpm, Yarn and Bun accept the same tarball path. [Build from source](../../install/from-source.md#javascript)
explains the recipe.

### After the first release {#after-the-first-release}

Once `@sponsorkit/sdk` is on npm, install it with your package manager instead. These commands fail today.

::::tabs{group="pm"}
:::tab[npm]
```bash
npm install @sponsorkit/sdk
```
:::
:::tab[pnpm]
```bash
pnpm add @sponsorkit/sdk
```
:::
:::tab[Yarn]
```bash
yarn add @sponsorkit/sdk
```
:::
:::tab[Bun]
```bash
bun add @sponsorkit/sdk
```
:::
:::tab[Deno]
```bash
deno add npm:@sponsorkit/sdk
```

Or import it directly with an `npm:` specifier: `import { Sponsorkit } from "npm:@sponsorkit/sdk/node";`
:::
:::tab[CDN]
For a page without a build step, load the ES module from an npm CDN such as esm.sh or jsDelivr:

```html
<script type="module">
  import { Sponsorkit } from "https://esm.sh/@sponsorkit/sdk";
  // or: https://cdn.jsdelivr.net/npm/@sponsorkit/sdk/+esm
</script>
```

Pin a version (`@sponsorkit/sdk@0.1.0`) in production.
:::
::::

## Pick an entry point

The package has four entry points. They share the same options, result shape, error codes and storage format;
they differ in how sign-in works and where state is kept.

| Import | Use it for | Sign-in | State lives in |
|---|---|---|---|
| `@sponsorkit/sdk` | Web apps and anything that runs in a browser | Popup, with an optional redirect fallback | `localStorage` |
| `@sponsorkit/sdk/node` | CLIs, desktop apps and other programs one person runs (Node, Bun, Deno) | Loopback redirect to the system browser, or paste-back | A file in the per-user config directory |
| `@sponsorkit/sdk/server` | Your backend, verifying a session token sent by your frontend | None (`verifySession()`) | Nothing |
| `@sponsorkit/sdk/elements` | Plain HTML pages | `<sponsorkit-button>` and `<sponsorkit-badge>` | `localStorage` |

Each entry point also re-exports the shared types and helpers, so you import everything from one place.

## A first look

```ts title="app.ts"
import { isSponsorkitError, Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-collective" });

// Never throws because of the network: falls back to the cached result.
const fc = await sk.getFinancialContribution();
console.log(fc.signedIn ? `${fc.active().length} active contribution(s)` : "Signed out");

// signIn() and openCheckout() open a popup, so call them straight from a click handler.
document.querySelector("#sponsor")?.addEventListener("click", async () => {
  try {
    const result = await sk.openCheckout({ frequency: "monthly", amount: 500 });
    if (result.status === "contributed") console.log("Thank you!", result.contribution.amount);
  } catch (e) {
    // "cancelled": the user closed the popup before signing in.
    if (!isSponsorkitError(e, "cancelled")) console.error(e);
  }
});
```

## In this section

| Page | What it covers |
|---|---|
| [Quickstart](quickstart.md) | A browser app and a Node CLI, end to end. |
| [Configuration](configuration.md) | Every constructor option with its default, and the environment variables. |
| [Sign-in](sign-in.md) | Popup and redirect sign-in in browsers; loopback and paste-back on Node, Bun and Deno. |
| [Contributions](contributions.md) | `getFinancialContribution()`, the result, its filter helpers, and caching. |
| [Checkout](checkout.md) | `openCheckout()`, `checkoutUrl()` and the web components. |
| [Nag](nag.md) | Asking for support every N runs or N days. |
| [Testing](testing.md) | Mock mode, injecting `fetch`, storage and a clock, and the fake server. |
| [Backend verification](backend-verification.md) | Checking a supporter on your server with `verifySession()`. |
| [Errors and cancellation](errors.md) | `SponsorkitError`, its codes, and `AbortSignal`. |
| [Platform notes](platform-notes.md) | Bundlers, SSR, CommonJS, Content Security Policy, storage locations. |

The [API reference](/docs/reference/js) lists every class, method, option and type, generated from the
TypeScript source.
