---
title: Nag in JavaScript / TypeScript
description: Ask for support every N runs or N days, never in CI, and never someone who already contributes.
sidebar_label: Nag
order: 50
---

A nag is a gentle "Enjoying this? Consider supporting it" message. `sk.nag()` remembers how often and when it
was shown, so you only decide what to print. The reasoning behind the defaults is in the
[nag guide](/docs/guides/nag).

```ts title="cli.ts"
import { Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({ github: "octocat", appName: "my-cli" });

const nag = sk.nag({ id: "my-cli", every: 10, orEvery: "P7D" });
if (await nag.due((fc) => fc.active().length === 0)) {
  console.error(`Enjoying my-cli? Support it: ${sk.checkoutUrl({ frequency: "monthly" })}`);
  await nag.shown();
}
```

## Options

| Option | Type | |
|---|---|---|
| `id` | `string` | Required. A stable name for this nag, e.g. your app's name. Several nags can coexist. |
| `every` | `number` | Required. Due after this many runs since it was last shown. |
| `orEvery` | `string \| number` | Also due when this much time has passed since it was last shown: an ISO 8601 duration (`"P7D"`, `"PT12H"`, `"P1W"`) or a number of seconds. |

`nag()` throws `invalid_config` for a missing `id`, a negative or non-numeric `every`, or an unparsable
`orEvery`.

## How due() decides

`due(predicate?, { force? })` returns `Promise<boolean>`:

1. It counts this run: the run counter goes up by one, once per process per `id`, on the first `due()` call,
   even if the nag isn't shown. In a browser, "process" means page load.
2. It returns `false` when `SPONSORKIT_DISABLE`, `SPONSORKIT_NO_NAG` or `CI` is set, or when the app isn't
   interactive (on Node: stdout or stderr isn't a TTY; browsers are always interactive). `{ force: true }`
   skips these checks except `SPONSORKIT_DISABLE`; the `interactive` constructor option overrides the TTY
   check.
3. If you pass a predicate, it calls `getFinancialContribution()` (served from the cache when fresh) and returns
   `false` unless `predicate(fc)` is true. The predicate may be async.
4. It returns `true` when `runs >= every`, or when `orEvery` has passed since the last `shown()`. Before the
   first `shown()`, only the run count applies.

`shown()` resets the run counter to zero and records the time. Call it only when you actually displayed the
message.

The nag never signs anyone in and never opens a browser. Its state lives with the rest of the SDK's state (see
[Platform notes](platform-notes.md#where-state-is-stored)) and survives `signOut()`; in mock mode it lives in
memory, per client.

## In a web app

The same API works in the browser. A run is a page load, so `every: 20` means "every 20 visits":

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat" });
const nag = sk.nag({ id: "docs-banner", every: 20, orEvery: "P14D" });

if (await nag.due((fc) => !fc.signedIn || fc.active().length === 0)) {
  const banner = document.querySelector<HTMLElement>("#support-banner");
  if (banner) {
    banner.hidden = false;
    await nag.shown();
  }
}
```

## Testing a nag

Use `force` to see the message in a non-TTY environment, and `resetProcessState()` to simulate a new process
in tests (see [Testing](testing.md#simulating-a-new-process)).
