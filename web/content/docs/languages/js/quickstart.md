---
title: JavaScript / TypeScript quickstart
description: Check for a contribution, sign a supporter in and open checkout, in a web app and in a Node CLI.
sidebar_label: Quickstart
order: 5
---

Two small, complete programs: a web page and a command-line tool. Both use the same calls; only the entry
point differs. Replace `octocat` and `my-collective` with the accounts you receive contributions on (one of the
two is enough).

`@sponsorkit/sdk` isn't on npm yet, so build it from the repository and install the tarball (building needs
[Bun](https://bun.sh)); [Install](index.md#install) explains this and lists the registry commands to use after the
first release:

```bash title="Terminal"
git clone https://github.com/sponsorkit/sponsorkit.io.git
(cd sponsorkit.io && bun install && bun run --cwd sdks/js build && cd sdks/js && npm pack)
npm install ./sponsorkit.io/sdks/js/sponsorkit-sdk-0.1.0.tgz
```

## A web app

The browser client keeps the supporter's session in `localStorage` and signs in through a popup. Popup
blockers only allow a window opened synchronously during a click, so `signIn()` and `openCheckout()` open their
popup before doing anything asynchronous: call them directly from the click handler, not after an `await`.

```ts title="main.ts"
import { isSponsorkitError, Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-collective" });

const status = document.querySelector<HTMLElement>("#status");
const signInButton = document.querySelector<HTMLButtonElement>("#sign-in");
const sponsorButton = document.querySelector<HTMLButtonElement>("#sponsor");

async function render(): Promise<void> {
  const fc = await sk.getFinancialContribution();
  if (!status) return;
  if (!fc.signedIn) status.textContent = "Sign in to see your contributions.";
  else if (fc.active().length > 0) status.textContent = "Thank you for supporting this project!";
  else status.textContent = "You're signed in, but not contributing yet.";
}

signInButton?.addEventListener("click", async () => {
  try {
    await sk.signIn();
  } catch (e) {
    // The user closed the popup: nothing to report.
    if (!isSponsorkitError(e, "cancelled")) console.error(e);
  }
  await render();
});

sponsorButton?.addEventListener("click", async () => {
  try {
    const result = await sk.openCheckout({ frequency: "monthly", amount: 500 });
    if (result.status === "contributed") await render();
  } catch (e) {
    // The user closed the popup while signing in: nothing to report.
    if (!isSponsorkitError(e, "cancelled")) console.error(e);
  }
});

await render();
```

`openCheckout()` signs the user in first when needed (in the same popup), shows the checkout page, and once
the popup closes, polls Sponsorkit until the new contribution appears or 10 minutes pass. If the user closes
the popup before they have signed in, it rejects with `cancelled`, just like `signIn()`. Read
[Checkout](checkout.md) for the details.

## A command-line tool

The `node` entry point signs in through the system browser and stores its state in the per-user config
directory, so the supporter signs in once per machine. Over SSH or without a display it prints a link and asks
for a code instead.

```ts title="my-cli.ts"
import { Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({
  github: "octocat",
  opencollective: "my-collective",
  appName: "my-cli", // shown on the consent page
});

const command = process.argv[2];

if (command === "login") {
  const fc = await sk.signIn();
  console.log(`Signed in. Active contributions: ${fc.active().length}`);
} else if (command === "sponsor") {
  const result = await sk.openCheckout({ frequency: "monthly", amount: 500 });
  console.log(result.status === "contributed" ? "Thank you!" : "No new contribution detected yet.");
} else {
  // Ask at most every 10 runs or once a week, and never someone who already contributes.
  const nag = sk.nag({ id: "my-cli", every: 10, orEvery: "P7D" });
  if (await nag.due((fc) => fc.active().length === 0)) {
    console.error(`Enjoying my-cli? Support it: ${sk.checkoutUrl({ frequency: "monthly" })}`);
    await nag.shown();
  }
  console.log("Doing the real work…");
}
```

Run it with `bun my-cli.ts`, `npx tsx my-cli.ts` or `deno run -A my-cli.ts`. The file uses no TypeScript-only
syntax, so you can also save it as `my-cli.mjs` and run it with `node my-cli.mjs`.

## Try it without an account

Set the `mock` option (or the `SPONSORKIT_MOCK` environment variable) to see each state without signing in or
touching the network:

```bash
SPONSORKIT_MOCK=active-monthly bun my-cli.ts
```

See [Testing](testing.md) for the presets.

## Next steps

- [Sign-in](sign-in.md): the redirect fallback for blocked popups, paste-back, cancellation.
- [Contributions](contributions.md): gating a feature on an amount, and what `stale` means.
- [Backend verification](backend-verification.md): don't trust the browser for anything that matters.
