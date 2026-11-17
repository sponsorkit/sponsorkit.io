---
title: Testing with JavaScript / TypeScript
description: Mock mode presets, custom contributions, injecting fetch, storage and a clock, and running against the fake server.
sidebar_label: Testing
order: 60
---

You shouldn't need a real sponsorship to develop or test the code around Sponsorkit. The SDK offers three
levels of fakes, from simplest to most realistic:

1. **Mock mode**: no network, no disk, canned data.
2. **Injected `fetch`, `storage` and `clock`**: real SDK logic against responses you control.
3. **The conformance fake server**: a local Sponsorkit API that every SDK is tested against.

## Mock mode

Set the `mock` option, or the `SPONSORKIT_MOCK` environment variable, to a preset name:

```ts
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", mock: "active-monthly" });

const fc = await sk.getFinancialContribution();
console.log(fc.mock, fc.active()[0]?.amount); // true { value: 500, currency: "USD" }
```

| Preset | Signed in | Contributions |
|---|---|---|
| `signed-out` | No | none |
| `none` | Yes | none |
| `active-monthly` | Yes | one active, monthly, 500 USD, direct |
| `one-time` | Yes | one paid, one-time, 2500 USD |
| `cancelled` | Yes | one cancelled, monthly, 500 USD |
| `org` | Yes | one active, monthly, 1000 USD, paid by an organization (`via: "organization"`) |

The contributions are attributed to your first target (GitHub when both are configured) and the supporter is
`mock-user`. The names are also exported as `MOCK_PRESETS`.

For anything else, pass your own contributions; the mock user is then signed in:

```ts
import type { Contribution } from "@sponsorkit/sdk";
import { Sponsorkit } from "@sponsorkit/sdk";

const yearly: Contribution = {
  id: "con_github_test",
  provider: "github",
  target: "github:octocat",
  sponsor: { type: "user", provider: "github", id: "1", handle: "alice" },
  via: "direct",
  kind: "recurring",
  frequency: "yearly",
  status: "active",
  amount: { value: 12000, currency: "USD" },
  tier: { id: "tier_1", name: "Gold" },
  flags: [],
  private: false,
  startedAt: "2026-01-01T00:00:00Z",
  endedAt: null,
  lastChargedAt: "2026-01-01T00:00:00Z",
  nextChargeAt: "2027-01-01T00:00:00Z",
  totalContributed: { value: 12000, currency: "USD" },
};

const sk = new Sponsorkit({ github: "octocat", mock: { contributions: [yearly] } });
```

How mock mode behaves:

- No network and no disk access. `getSessionToken()` returns `null`.
- `signIn()` resolves immediately and signs the mock user in (with no contributions if the preset was
  `signed-out`). `signOut()` signs them out.
- `openCheckout()` resolves `{ status: "contributed" }` at once with a simulated contribution built from your
  options (default 500 USD monthly; `one_time` gives a `paid` one-time contribution), and later
  `getFinancialContribution()` calls include it.
- Nag state lives in memory, per client.
- The `mock` option beats `SPONSORKIT_MOCK`, and `SPONSORKIT_DISABLE` beats both. An unknown preset name throws
  `invalid_config`.

The [mock mode guide](/docs/guides/mock-mode) shows how to use this for screenshots and demos.

## Unit tests with injected dependencies

To exercise the real cache, error handling and nag logic without a server, inject the pieces that touch the
outside world:

| Option | Inject |
|---|---|
| `fetch` | A function returning `Response` objects you build. |
| `storage` | `memoryStorage(new Map())`, so tests don't share state with each other or with your real session. |
| `clock` | A function returning the "current" epoch milliseconds, to move time forward. |
| `env` | `{}` to ignore the developer's own `SPONSORKIT_*` and `CI` variables. |
| `interactive` | `true` or `false`, to make nag tests independent of the terminal. |

```ts title="nag.test.ts"
import { expect, test } from "bun:test";
import { memoryStorage, resetProcessState } from "@sponsorkit/sdk";
import { Sponsorkit } from "@sponsorkit/sdk/node";

test("the nag is due on the third run", async () => {
  const storage = memoryStorage(new Map());
  const make = () => new Sponsorkit({ github: "octocat", storage, env: {}, interactive: true });

  for (const expected of [false, false, true]) {
    resetProcessState(); // each iteration is a new "process"
    expect(await make().nag({ id: "test", every: 3 }).due()).toBe(expected);
  }
});
```

A `fetch` stub lets you test what your app does with a stale result:

```ts title="offline.test.ts"
import { expect, test } from "bun:test";
import { memoryStorage, type SponsorkitStorage, targetsHash } from "@sponsorkit/sdk";
import { Sponsorkit } from "@sponsorkit/sdk/node";

test("an outage serves a signed-in, stale result", async () => {
  // A stored session, as signIn() would leave it.
  const storage: SponsorkitStorage = memoryStorage(new Map());
  await storage.write(await targetsHash("github:octocat"), JSON.stringify({ v: 1, sessionToken: "sks_test" }));

  const sk = new Sponsorkit({
    github: "octocat",
    storage,
    env: {},
    fetch: async () => new Response("unavailable", { status: 503 }),
  });

  const fc = await sk.getFinancialContribution();
  expect(fc.signedIn).toBe(true);
  expect(fc.stale).toBe(true);
});
```

The storage document format is described in [Platform notes](platform-notes.md#where-state-is-stored).

## Simulating a new process

Some state is deliberately kept per process: which nags were already counted this run, the dev-time target
check, and the `Retry-After` back-off. `resetProcessState()` (also available as
`Sponsorkit.resetProcessState()`) forgets it, so one test file can simulate several runs of your app.

## Against the fake server

The repository ships the fake Sponsorkit API used by the conformance suite. It implements the real HTTP
protocol, including sign-in and checkout, so you can run end-to-end tests of your app:

```bash
bun sdks/conformance/server.ts --port 8787
# prints: LISTENING 8787
```

Then point the client at it, keep state in a temporary directory, and replace the browser and the prompt:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sponsorkit } from "@sponsorkit/sdk/node";

const sk = new Sponsorkit({
  github: "octocat",
  apiBaseUrl: "http://127.0.0.1:8787",
  storageDir: mkdtempSync(join(tmpdir(), "sponsorkit-")),
  env: {},
  openBrowser: async (url) => {
    // Drive the sign-in page with fetch or a headless browser here.
    console.log("would open", url);
  },
});
```

The fake server's `/connect` and `/checkout` pages are non-interactive, and it has a control API for setting
up contributions; `sdks/conformance/README.md` in the repository describes both.
