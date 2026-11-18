---
title: Add a sponsor button to a web app
description: Use the <sponsorkit-button> and <sponsorkit-badge> elements, or the JavaScript API with its popup flow and redirect fallback.
order: 20
---

In the browser, Sponsorkit signs people in and runs checkout in a **popup** on the Sponsorkit website
(`sponsorkit.github.io/sponsorkit.io`), then hands the result back to your page. You don't register an app, a
callback URL or an origin: the popup only posts the sign-in code back to the page that opened it, and the consent
screen shows that page's origin.

This guide is JavaScript-only, because the browser SDK is. Desktop apps and CLIs in any language are covered
in [Use Sponsorkit in a CLI or desktop app](native-apps.md).

:::tabs{group="pm"}
```bash tab="npm" key="npm"
npm install @sponsorkit/sdk
```
```bash tab="pnpm" key="pnpm"
pnpm add @sponsorkit/sdk
```
```bash tab="Yarn" key="yarn"
yarn add @sponsorkit/sdk
```
```bash tab="Bun" key="bun"
bun add @sponsorkit/sdk
```
:::

There are two ways to use it: drop-in custom elements, or the `Sponsorkit` class when you want your own UI.

## Option 1: custom elements

Importing `@sponsorkit/sdk/elements` once registers two elements:

- `<sponsorkit-button>` opens checkout when clicked, signing the person in first if needed.
- `<sponsorkit-badge>` shows "Supporter ♥" when the signed-in person has an active contribution, and nothing
  otherwise.

```ts title="main.ts"
import "@sponsorkit/sdk/elements";
```

```html title="index.html"
<sponsorkit-button github="octocat" opencollective="my-project" amount="500" frequency="monthly">
  Sponsor ♥
</sponsorkit-button>

<sponsorkit-badge github="octocat" opencollective="my-project"></sponsorkit-badge>
```

The import has side effects (it calls `customElements.define`), so import it from your entry module rather
than lazily from a component that may never load.

### Attributes

| Attribute | Element | Meaning |
|---|---|---|
| `github`, `opencollective` | both | Your accounts. At least one is required. |
| `api-base-url` | both | Your own Sponsorkit API origin, if you [self-host](../reference-http/self-hosting.md). |
| `site-base-url` | both | Your own Sponsorkit site (consent and checkout pages), if you self-host it somewhere other than the API origin. Defaults to `api-base-url` when only that is set. |
| `amount` | button | Suggested amount in minor units (`500` is $5.00). |
| `currency` | button | ISO 4217 code, e.g. `USD` or `EUR`. |
| `frequency` | button | `one_time`, `monthly` or `yearly`. |
| `provider` | button | `github` or `opencollective`, to skip the provider chooser. |
| `label` | button | Accessible name (`aria-label`) when the visible content isn't descriptive. |

The element's content replaces the default label ("Sponsor ♥" and "Supporter ♥"). The badge toggles the
standard `hidden` attribute and adds a `supporter` attribute while it's shown. Style the inner parts with
`::part()`:

```css title="styles.css"
sponsorkit-button::part(button) {
  background: #bf3989;
  color: white;
  border: none;
}

sponsorkit-badge::part(badge) {
  font-weight: 600;
}
```

### Events

The button dispatches `sponsorkit:checkout` when checkout finishes, with the
[checkout result](checkout.md#what-the-result-means) as `detail`, and `sponsorkit:error` with
`detail.error` (a `SponsorkitError`) when it fails. Both bubble. The badge doesn't re-check on its own after
a checkout, so call its `refresh()` method:

```ts title="main.ts"
import "@sponsorkit/sdk/elements";
import type { CheckoutResult } from "@sponsorkit/sdk";
import type { SponsorkitBadgeElement } from "@sponsorkit/sdk/elements";

const badge = document.querySelector<SponsorkitBadgeElement>("sponsorkit-badge");

document.addEventListener("sponsorkit:checkout", (event) => {
  const result = (event as CustomEvent<CheckoutResult>).detail;
  if (result.status === "contributed") void badge?.refresh();
});

document.addEventListener("sponsorkit:error", (event) => {
  console.warn("Sponsorkit:", (event as CustomEvent<{ error: unknown }>).detail.error);
});
```

### Sharing a configured client

Each element creates its own client from its attributes. Elements and `Sponsorkit` instances with the same
targets share one `localStorage` entry, so signing in anywhere on the page is visible to all of them after a
`refresh()`. To pass options that have no attribute (for example `returnTo`, below), set the element's
`client` property to your own instance:

```ts title="main.ts"
import { Sponsorkit } from "@sponsorkit/sdk";
import type { SponsorkitBadgeElement, SponsorkitButtonElement } from "@sponsorkit/sdk/elements";
import "@sponsorkit/sdk/elements";

const sk = new Sponsorkit({
  github: "octocat",
  opencollective: "my-project",
  returnTo: `${location.origin}/account`,
});

const button = document.querySelector<SponsorkitButtonElement>("sponsorkit-button");
const badge = document.querySelector<SponsorkitBadgeElement>("sponsorkit-badge");
if (button) button.client = sk;
if (badge) {
  badge.client = sk;
  void badge.refresh();
}
```

`elementDefaults`, also exported from `@sponsorkit/sdk/elements`, holds options merged into every client the
elements create from then on. Buttons build their client on the first click, so `elementDefaults` set right
after the import applies to them. Badges build theirs as soon as they are connected, so set `elementDefaults`
before the elements are parsed, or use the `client` property.

## Option 2: the JavaScript API

Use the `Sponsorkit` class for your own buttons and logic:

```ts title="account.ts"
import { Sponsorkit, isSponsorkitError } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-project" });

const status = document.querySelector<HTMLElement>("#status");
const signInButton = document.querySelector<HTMLButtonElement>("#sign-in");
const sponsorButton = document.querySelector<HTMLButtonElement>("#sponsor");

async function render(): Promise<void> {
  const fc = await sk.getFinancialContribution();
  if (!status) return;
  if (!fc.signedIn) status.textContent = "Not signed in";
  else if (fc.active().length > 0) status.textContent = "Thanks for sponsoring ♥";
  else status.textContent = "Signed in, no active sponsorship";
}

signInButton?.addEventListener("click", () => {
  // No `await` before signIn(): it must open its popup during the click.
  sk.signIn().then(render, (e: unknown) => {
    if (isSponsorkitError(e, "popup_blocked")) alert("Please allow popups for this site to sign in.");
    else if (!isSponsorkitError(e, "cancelled")) console.error(e);
  });
});

sponsorButton?.addEventListener("click", () => {
  sk.openCheckout({ frequency: "monthly", amount: 500 }).then(render, console.error);
});

void render();
```

### Why the click handler matters

Browsers only allow `window.open` during a user gesture. `signIn()` and `openCheckout()` open their popup
**synchronously**, before their first `await`, so they work when you call them directly from a click handler.
If you `await` something first (a fetch, a confirm dialog), the gesture is used up and the popup is blocked.

Closing the popup rejects `signIn()` with `cancelled`. You can also pass an `AbortSignal` as `signal` to cancel
it yourself; `signInTimeout` (300 seconds by default) bounds how long it waits.

### When the popup is blocked: the redirect fallback

Without extra configuration, a blocked popup rejects with `popup_blocked`. Set `returnTo` to fall back to a
full-page redirect instead:

```ts title="sponsorkit.ts"
import { Sponsorkit } from "@sponsorkit/sdk";

export const sk = new Sponsorkit({
  github: "octocat",
  opencollective: "my-project",
  // An https URL of your app (http is allowed only for localhost, 127.0.0.1 and [::1]).
  returnTo: "https://app.example.com/account",
});
```

With `returnTo`, a blocked `signIn()` works like this:

1. The SDK saves its PKCE verifier in `sessionStorage` and navigates the whole tab to the consent page.
2. After consent, the person comes back to `returnTo` with `?sponsorkit_code=…` (or `?sponsorkit_error=…`).
3. On that page, the next SDK call (`getFinancialContribution()`, `isSignedIn()` and so on) finishes the sign-in
   and removes the parameter from the address bar.

The original `signIn()` promise never settles, because the page navigated away. To show sign-in errors after
the redirect, call `handleRedirectCallback()` yourself when the page loads. It resolves `true` when it completed
a sign-in and rejects with the sign-in error code:

```ts title="account.ts"
import { Sponsorkit, isSponsorkitError } from "@sponsorkit/sdk";

const sk = new Sponsorkit({
  github: "octocat",
  opencollective: "my-project",
  returnTo: "https://app.example.com/account",
});

try {
  if (await sk.handleRedirectCallback()) console.log("Signed in");
} catch (e) {
  if (isSponsorkitError(e, "access_denied")) console.log("Sign-in was declined.");
  else console.error(e);
}
```

`openCheckout()` with a blocked popup and `returnTo` set navigates the tab to the checkout page without signing
in first. The person can still contribute, but the SDK can't detect it in that tab; the contribution shows up
the next time they're signed in and the cache refreshes.

:::tip
In frameworks that render on the server, create and use the client in browser-only code (for example a client
component or an effect). On the server there's no `localStorage`, so the client would keep its state in memory
and forget it.
:::

## Catching typos during development

When `process.env.NODE_ENV` is `"development"` (most bundlers set it in dev builds) or `SPONSORKIT_DEV_CHECKS`
is set, the first async call checks once that your accounts exist and have a sponsorship listing. A typo then
rejects with `invalid_config` instead of quietly finding no sponsors. Production builds skip the check. Force it
either way with the `devChecks` option.

## Where state is kept

The session token, the cached result and nag counters are stored in `localStorage` under
`sponsorkit:<targets_hash>`, one entry per set of targets. `signOut()` deletes the token and the cache locally;
there is no server-side session to end. Pass `storage` to use a different `Storage` object, such as
`sessionStorage`. More in [Sessions](../concepts/sessions.md).
