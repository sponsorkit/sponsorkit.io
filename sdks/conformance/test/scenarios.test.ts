/**
 * Runs every scenario in scenarios.json against the reference SDK in
 * test/reference-sdk.ts. This proves the scenarios are self-consistent and
 * executable against the fake server; real SDKs run the same scenarios.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import scenariosJson from "../scenarios.json";
import { loadScenarios, runScenario } from "../src/runner";
import { startServer, type RunningServer } from "../src/server";
import { referenceAdapter, removeTree } from "./reference-sdk";

const file = loadScenarios(scenariosJson);
let server: RunningServer;
let storageRoot: string;

beforeAll(async () => {
  server = await startServer();
  storageRoot = await mkdtemp(join(tmpdir(), "sponsorkit-conformance-"));
});

afterAll(async () => {
  await server.stop();
  await removeTree(storageRoot);
});

describe("scenarios.json against the reference SDK", () => {
  for (const scenario of file.scenarios) {
    const skip = scenario.requires.includes("posixPermissions") && process.platform === "win32";
    test.skipIf(skip)(
      scenario.id,
      async () => {
        await runScenario(scenario, referenceAdapter, { baseUrl: server.baseUrl, siteBaseUrl: server.siteBaseUrl, storageRoot, variables: file.variables });
      },
      30_000,
    );
  }
});

test("scenario ids are unique", () => {
  const ids = file.scenarios.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("every SPEC §7.9 area is covered", () => {
  const ids = new Set(file.scenarios.map((s) => s.id));
  const required = [
    "config-malformed-target",
    "config-target-missing",
    "disabled-env",
    ...["signed-out", "none", "active-monthly", "one-time", "cancelled", "org"].map((p) => `mock-preset-${p}`),
    "signed-out",
    "sign-in-loopback",
    "sign-in-paste",
    "sign-in-add-identity",
    "session-invalid",
    "session-renewal",
    "cache-hit",
    "offline-with-cache",
    "offline-without-cache",
    "partial-outage",
    "rate-limited",
    "checkout-detects-new-contribution",
    "checkout-timeout",
    "checkout-cancelled",
    "nag-run-counting",
    "storage-permissions",
    "storage-concurrent-writes",
    "verify-session-match",
    "verify-session-mismatch",
  ];
  for (const id of required) expect(ids.has(id)).toBe(true);
});

test("every behaviour pinned by PROTOCOL §7 / §7.1 items 13-17 is covered", () => {
  const ids = new Set(file.scenarios.map((s) => s.id));
  const required = [
    "sign-in-cancelled",
    "sign-in-timeout",
    "sign-in-token-server-error",
    "sign-in-invalid-code",
    "sign-in-add-identity-dead-session",
    "verify-session-unreachable",
    "verify-session-rate-limited",
    "verify-session-server-error",
    "mock-nag-in-memory",
    "checkout-url-invalid",
    "checkout-signs-in-first",
    "config-dev-checks-env",
    "config-dev-checks-default-off",
    "config-cache-ttl-minimum",
    "config-env-replaces-process-env",
    "nag-interactive",
    "nag-suppressed",
  ];
  for (const id of required) expect(ids.has(id)).toBe(true);
});

test("the site/API split (PROTOCOL §0, §7 base URL rules, §7.1 items 8, 16, 17) is covered", () => {
  const ids = new Set(file.scenarios.map((s) => s.id));
  const required = [
    "site-base-url-sign-in-loopback",
    "site-base-url-sign-in-paste",
    "site-base-url-defaults-to-api",
    "site-base-url-checkout-url",
    "site-base-url-trailing-slashes",
    "site-base-url-checkout-signed-in",
    "site-base-url-checkout-signs-in-first",
  ];
  for (const id of required) expect(ids.has(id)).toBe(true);
  for (const id of required) expect(file.scenarios.find((s) => s.id === id)!.requires).toContain("siteBaseUrl");
});
