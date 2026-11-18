---
title: Checkout in JavaScript / TypeScript
description: Send users to contribute with openCheckout() and checkoutUrl(), or with the sponsorkit-button web component.
sidebar_label: Checkout
order: 40
---

There are two ways to send someone to contribute, plus a ready-made button for plain HTML pages:

| | `openCheckout()` | `checkoutUrl()` |
|---|---|---|
| Returns | `Promise<CheckoutResult>` | `string` |
| Signs the user in | Yes, first, if needed | No |
| Detects the new contribution | Yes, by polling | No |
| Network | Yes | None (synchronous, works offline) |
| Good for | A "Sponsor" button inside your app | Nag messages, READMEs, links in emails or logs |

The provider-neutral view of checkout is in the [checkout guide](/docs/guides/checkout).

## openCheckout()

```ts
import { isSponsorkitError, Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-collective" });

document.querySelector("#sponsor")?.addEventListener("click", async () => {
  try {
    const result = await sk.openCheckout({ frequency: "monthly", amount: 500, currency: "USD" });
    if (result.status === "contributed") {
      const { amount, provider } = result.contribution;
      console.log(`Thank you for ${amount.value / 100} ${amount.currency} on ${provider}!`);
    }
  } catch (e) {
    // "cancelled": the user closed the popup before signing in.
    if (!isSponsorkitError(e, "cancelled")) console.error(e);
  }
});
```

What happens:

1. **Sign-in, if there is no session.** It uses the same flow as [`signIn()`](sign-in.md) and the
   `signInTimeout`. In a browser the sign-in and the checkout share one popup, so call `openCheckout()` straight
   from a click handler.
2. **Checkout.** The checkout page opens in the popup (browser) or the system browser (Node). On Node, if the
   browser can't be opened, the URL is printed to `output`.
3. **Waiting.** The SDK polls the API with `cacheTtl: 0` every `pollInterval` seconds (default:
   `checkoutPollInterval`, 60) until a new or changed contribution appears. In a browser, polling starts when
   the popup closes; on Node it starts right away.

It resolves `{ status: "contributed", contribution }` with the new or changed contribution, or
`{ status: "unknown" }` when nothing showed up within `timeout` seconds (default 600, counted from when polling
starts) or when you cancel through `signal`. "Unknown" doesn't mean the user didn't contribute: some payments
take a while to confirm. Call `getFinancialContribution()` later to check again.

### Options

| Option | Type | Default | |
|---|---|---|---|
| `provider` | `"github" \| "opencollective"` | user picks | Preferred provider. The checkout page never switches provider silently. |
| `amount` | `number` | user picks | Suggested amount in minor units (cents); a positive integer. |
| `currency` | `string` | provider default | ISO 4217 code, e.g. `"USD"`. |
| `frequency` | `"one_time" \| "monthly" \| "yearly"` | user picks | Suggested frequency. |
| `timeout` | `number` | `600` | Seconds to wait for the contribution once polling starts. |
| `pollInterval` | `number` | `checkoutPollInterval` | Seconds between polls, for this call. |
| `signal` | `AbortSignal` | none | Cancels sign-in or waiting; the promise then resolves `{ status: "unknown" }`. |
| `method` | `"auto" \| "loopback" \| "paste"` | `signInMethod` | Node only: the sign-in method, if a sign-in is needed. |

`provider`, `amount`, `currency` and `frequency` are validated: a provider you didn't configure, a non-integer or
non-positive amount, a currency that isn't three letters, or an unknown frequency throws `invalid_config`.

Aborting your `signal` resolves rather than rejects, because "your app stopped waiting" is a normal outcome, and
so does the polling `timeout`. Everything else rejects: `disabled`, `invalid_config`, `popup_blocked`, the
sign-in errors, `timeout` if the *sign-in* phase exceeds `signInTimeout`, and `cancelled` if the user closes the
popup (browser) or enters no code (Node paste-back) before signing in, exactly as with `signIn()`. Once the user
is signed in, closing the popup just starts the polling.

```ts
import { Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({ github: "octocat", appName: "my-cli" });

// Stop waiting after two minutes, checking every 10 seconds.
const result = await sk.openCheckout({ frequency: "one_time", amount: 1000, timeout: 120, pollInterval: 10 });
console.log(result.status);
```

### Blocked popups

With the browser client, a blocked popup rejects with `popup_blocked` unless you set
[`returnTo`](sign-in.md#redirect-fallback-for-blocked-popups). With `returnTo`, the current page navigates to the
checkout page instead; when there is no session, it goes there without signing in first. The promise never
settles because the page unloads, and the new contribution isn't detected; it shows up on the next
`getFinancialContribution()` once the cache expires, or immediately with `cacheTtl: 0`.

## checkoutUrl()

`checkoutUrl()` builds a link to the checkout page from the same `provider`, `amount`, `currency` and
`frequency` options. It is synchronous and makes no request, so it works in a nag message printed on every
run, offline, or in generated documentation.

```ts
import { Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-collective" });

console.error(`Support this project: ${sk.checkoutUrl({ frequency: "monthly" })}`);
// https://sponsorkit.github.io/sponsorkit.io/checkout/?targets=github%3Aoctocat%2Copencollective%3Amy-collective&frequency=monthly
```

Contributions made through this link aren't detected by the app that printed it, but they show up in
`getFinancialContribution()` once the supporter signs in.

## Web components

`@sponsorkit/sdk/elements` registers two custom elements when imported, for pages without a framework:

```html
<script type="module">
  import { elementDefaults } from "@sponsorkit/sdk/elements";
  // Optional: options for every client an element creates.
  elementDefaults.returnTo = location.href;
</script>

<sponsorkit-button github="octocat" opencollective="my-collective" amount="500" frequency="monthly">
  Sponsor ♥
</sponsorkit-button>

<sponsorkit-badge github="octocat" opencollective="my-collective"></sponsorkit-badge>
```

- `<sponsorkit-button>` calls `openCheckout()` on click. Attributes: `github`, `opencollective`, `api-base-url`,
  `site-base-url`, `amount`, `currency`, `frequency`, `provider`, and `label` (sets `aria-label`). The slot is the button text
  (default "Sponsor ♥"); style it with `::part(button)`. It fires `sponsorkit:checkout` with the
  `CheckoutResult` as `detail`, and `sponsorkit:error` with `detail.error`.
- `<sponsorkit-badge>` shows its slot (default "Supporter ♥") when the signed-in user has an active
  contribution, and is `hidden` otherwise; it also sets a `supporter` attribute when shown. Style it with
  `::part(badge)`. Call `badge.refresh()` after signing in or checking out.
- Both accept a shared client: `element.client = sk`. Otherwise each builds its own `Sponsorkit` from its
  attributes and `elementDefaults`.

In TypeScript, the classes are `SponsorkitButtonElement` and `SponsorkitBadgeElement`:

```ts
import { type SponsorkitBadgeElement, Sponsorkit } from "@sponsorkit/sdk/elements";
import type { CheckoutResult } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat" });
const badge = document.querySelector<SponsorkitBadgeElement>("sponsorkit-badge");
if (badge) badge.client = sk;

document.addEventListener("sponsorkit:checkout", (event) => {
  const result = (event as CustomEvent<CheckoutResult>).detail;
  if (result.status === "contributed") void badge?.refresh();
});
```

`defineElements()` registers the elements (it runs automatically on import, and does nothing if they are
already defined or there is no `customElements` registry).
