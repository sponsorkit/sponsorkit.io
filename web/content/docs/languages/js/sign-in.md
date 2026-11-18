---
title: Sign-in in JavaScript / TypeScript
description: How supporters sign in from a browser (popup or redirect) and from Node, Bun or Deno (loopback or paste-back), and how to cancel.
sidebar_label: Sign-in
order: 20
---

Supporters sign in with the GitHub or Open Collective account they pay with. Sponsorkit runs the OAuth flow and
hands your app a session token bound to your target set; the provider's own token never reaches your app.
The SDK stores the session token and uses it for every later `getFinancialContribution()` call. Background on
what a session is and how long it lasts: [Sessions](/docs/concepts/sessions).

```ts
const fc = await sk.signIn();                         // shows a provider picker
const gh = await sk.signIn({ provider: "github" });   // skips the picker
```

`signIn()` resolves with the fresh [`FinancialContribution`](contributions.md), so you don't need a second call
to see what the new supporter contributes.

## In the browser

`Sponsorkit` from `@sponsorkit/sdk` signs in through a popup:

1. `signIn()` synchronously opens an empty popup (`window.open("about:blank", "sponsorkit", popupFeatures)`).
   That is why it must run inside a click or key handler: browsers only allow popups opened during a user
   gesture. Don't `await` anything before calling it.
2. The popup goes to Sponsorkit's `/connect/` page (on `siteBaseUrl`) with a PKCE challenge, the user picks a
   provider and approves.
3. Sponsorkit's `/connect/done/` page posts a one-time code back to your page with `postMessage`. The SDK accepts
   it only from the origin of `siteBaseUrl` (by default `https://sponsorkit.github.io`) and from that popup,
   exchanges it for a session token and stores the token in `localStorage`.

If the user closes the popup, `signIn()` rejects with `cancelled`.

```ts
import { isSponsorkitError, Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat" });

document.querySelector("#sign-in")?.addEventListener("click", async () => {
  try {
    const fc = await sk.signIn();
    console.log("Signed in as", fc.supporter?.identities.map((i) => i.handle).join(", "));
  } catch (e) {
    if (isSponsorkitError(e, "cancelled")) return; // the user closed the popup
    if (isSponsorkitError(e, "popup_blocked")) {
      alert("Please allow popups for this site to sign in.");
      return;
    }
    throw e;
  }
});
```

### Redirect fallback for blocked popups

Some browsers and in-app web views block popups even during a click. Pass `returnTo` and the SDK falls back to
a full-page redirect instead of rejecting with `popup_blocked`:

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({
  github: "octocat",
  returnTo: `${location.origin}/account`, // https, or http://localhost while developing
});
```

With the fallback, the page navigates to Sponsorkit (the `signIn()` promise never settles, because the page
unloads) and comes back to `returnTo` with `?sponsorkit_code=…` (or `?sponsorkit_error=…`). The PKCE verifier
is kept in `sessionStorage` meanwhile. On the next SDK call on the returned page, the SDK exchanges the code,
stores the session and removes the parameters from the address bar with `history.replaceState`.

That automatic completion swallows errors. To show them, or to know that a sign-in just completed, call
`handleRedirectCallback()` yourself when the page loads:

```ts
import { isSponsorkitError, Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", returnTo: `${location.origin}/account` });

try {
  if (await sk.handleRedirectCallback()) console.log("Welcome back, you're signed in.");
} catch (e) {
  if (isSponsorkitError(e, "access_denied")) console.log("Sign-in was declined.");
  else throw e;
}
```

`handleRedirectCallback()` resolves `false` when the URL carries no Sponsorkit parameters (or the page didn't
start the redirect), so it is safe to call on every page load.

### Customizing the popup

`popupFeatures` changes the window size and chrome; `openWindow` replaces `window.open` entirely, for example
to open a tab instead of a popup. It is called with `about:blank` (the SDK navigates the window once it knows
the URL), must open the window synchronously, and returns it, or `null` if it couldn't.

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({
  github: "octocat",
  openWindow: (url) => window.open(url, "_blank"),
});
```

## Node, Bun and Deno

`Sponsorkit` from `@sponsorkit/sdk/node` has two ways to get the code back, chosen by `signInMethod`:

| Method | How it works | Good for |
|---|---|---|
| `"loopback"` | Starts a one-shot HTTP receiver on `http://127.0.0.1:<random port>/callback`, opens the system browser at Sponsorkit, and waits for the browser to be redirected back to the receiver ([RFC 8252](https://www.rfc-editor.org/rfc/rfc8252)). | Desktop machines. |
| `"paste"` | Prints a URL; the user opens it on any device, signs in, and pastes the code shown on the page (valid for 10 minutes) back into the terminal. | SSH sessions, containers, headless servers. |
| `"auto"` (default) | Uses paste-back when `SSH_CONNECTION` or `SSH_TTY` is set, or on Linux when neither `DISPLAY` nor `WAYLAND_DISPLAY` is; otherwise tries loopback and falls back to paste-back when the browser can't be opened or the receiver can't bind to `127.0.0.1`. | Most apps. |

The browser is opened by running `open` (macOS), `xdg-open` (Linux) or `rundll32 url.dll,FileProtocolHandler`
(Windows) with the URL as a single argument, never through a shell. A launcher that is still running after
about 1.5 seconds counts as having opened the browser.

Force a method for one call with `method`:

```ts
import { Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({ github: "octocat", appName: "my-cli" });

const remote = process.argv.includes("--remote");
await sk.signIn({ method: remote ? "paste" : "auto" });
```

### Bringing your own prompt

Paste-back reads a line from stdin by default and prints instructions to stderr. A pending stdin read can't be
cancelled, so after a cancelled or timed-out paste-back the next line the user types may still go to it. If
your app reads stdin itself (a REPL, an interactive prompt library), pass `promptForCode`, and `output` to
redirect the messages:

```ts
import { createInterface } from "node:readline/promises";
import { Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({
  github: "octocat",
  appName: "my-cli",
  promptForCode: async (url) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await rl.question(`Open ${url}, sign in, then paste the code: `);
    } finally {
      rl.close();
    }
  },
  output: { write: (text) => process.stdout.write(text) },
});
```

An empty code rejects with `cancelled`. `openBrowser` replaces how URLs are opened, for example to print the
link in a GUI app; if it throws or rejects, `"auto"` falls back to paste-back and `"loopback"` prints the URL
and keeps waiting.

## Timeouts and cancellation

Sign-in waits up to `signInTimeout` seconds (default 300) and then rejects with `timeout`. To cancel earlier,
pass an `AbortSignal`; `signIn()` then rejects with `cancelled`:

```ts
import { isSponsorkitError, Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({ github: "octocat", appName: "my-cli" });
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());

try {
  await sk.signIn({ signal: controller.signal });
} catch (e) {
  if (isSponsorkitError(e, "cancelled") || isSponsorkitError(e, "timeout")) console.error("Sign-in abandoned.");
  else throw e;
}
```

## A second identity

A supporter can link both their GitHub and Open Collective accounts to one session. While signed in, calling
`signIn()` again (typically with the other `provider`) adds that identity instead of replacing the session, and
the result then includes contributions from both. `fc.supporter.identities` lists the linked accounts; an
identity with `needsReconnect: true` has an expired or revoked provider token and needs signing in again with
that provider.

`signIn({ provider })` throws `invalid_config` when you didn't configure a target for that provider.

## Session helpers

| Call | Returns | Network |
|---|---|---|
| `isSignedIn()` | `Promise<boolean>`: whether a session token is stored. | No |
| `getSessionToken()` | `Promise<string \| null>`: the `sks_…` token to forward to your backend; `null` when signed out, disabled or in mock mode. | No |
| `signOut()` | `Promise<void>`: deletes the token and the cached result locally. Nag state is kept. | No |

There is no server-side sign-out: the session simply stops being used. `signOut()` rejects with
`invalid_config` if the storage can't be written.

## Errors you can get

`signIn()` rejects with a [`SponsorkitError`](errors.md) whose `code` is one of `disabled`, `invalid_config`,
`popup_blocked` (browser), `access_denied`, `invalid_state`, `provider_error`, `invalid_code`, `cancelled`,
`timeout` or `network_error`. In mock mode it resolves immediately and signs the mock user in.
