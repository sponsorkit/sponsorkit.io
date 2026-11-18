/**
 * The runner must fail loudly: corrupt expectations and a deliberately broken
 * SDK are both rejected.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import scenariosJson from "../scenarios.json";
import { ScenarioFailure, loadScenarios, runScenario, type ParsedScenario, type SdkAdapter, type SdkInstance } from "../src/runner";
import { startServer, type RunningServer } from "../src/server";
import { referenceAdapter, removeTree } from "./reference-sdk";

const file = loadScenarios(scenariosJson);
let server: RunningServer;
let storageRoot: string;
const run = (s: ParsedScenario, adapter: SdkAdapter = referenceAdapter) =>
  runScenario(s, adapter, { baseUrl: server.baseUrl, storageRoot, variables: file.variables });
const scenario = (id: string) => structuredClone(file.scenarios.find((s) => s.id === id)!);
const corrupt = (id: string, from: string, to: string) => {
  const json = JSON.stringify(scenario(id));
  expect(json).toContain(from);
  return JSON.parse(json.replace(from, to)) as ParsedScenario;
};

beforeAll(async () => {
  server = await startServer();
  storageRoot = await mkdtemp(join(tmpdir(), "sponsorkit-runner-"));
});
afterAll(async () => {
  await server.stop();
  await removeTree(storageRoot);
});

test.each([
  ["sign-in-loopback", '"handle":"conformance-user"', '"handle":"someone-else"', /returns/],
  ["session-renewal", '"sessionToken":"$SESSION_TOKEN_2"', '"sessionToken":"$SESSION_TOKEN_1"', /sessionToken/],
  ["nag-run-counting", '"runs":1', '"runs":2', /runs/],
  ["rate-limited", '"retryAfter":60', '"retryAfter":0', /unexpected request|expected/],
  ["signed-out", '"returns":false', '"returns":true', /returns/],
  ["disabled-env", '"throws":"disabled"', '"throws":"invalid_config"', /expected error invalid_config/],
  ["checkout-timeout", '"minSeconds":2.5', '"minSeconds":20', /took/],
  ["sign-in-timeout", '"throws":"timeout"', '"throws":"cancelled"', /expected error cancelled/],
  ["verify-session-rate-limited", '"code":"network_error","retryAfter":30}', '"code":"network_error","retryAfter":31}', /error/],
  ["mock-nag-in-memory", 'runs is 1 here.","expect":{"returns":false}', 'runs is 1 here.","expect":{"returns":true}', /returns/],
])("corrupted %s is rejected", async (id, from, to, message) => {
  const err = await run(corrupt(id, from, to)).catch((e) => e);
  expect(err).toBeInstanceOf(ScenarioFailure);
  expect(String(err)).toMatch(message);
}, 30_000);

test("an SDK that ignores the cache fails cache-hit", async () => {
  const broken: SdkAdapter = {
    ...referenceAdapter,
    async create(config, hooks) {
      const inner = await referenceAdapter.create(config, hooks);
      const wrapped: SdkInstance = Object.create(inner);
      wrapped.getFinancialContribution = () => inner.getFinancialContribution({ cacheTtl: 0 });
      return wrapped;
    },
  };
  const err = await run(scenario("cache-hit"), broken).catch((e) => e);
  expect(err).toBeInstanceOf(ScenarioFailure);
  expect(String(err)).toMatch(/unexpected request GET \/api\/v1\/contributions|fromCache/);
}, 30_000);

test("an SDK that throws on network errors fails offline-with-cache", async () => {
  const broken: SdkAdapter = {
    ...referenceAdapter,
    async create(config, hooks) {
      if (config.apiBaseUrl.startsWith("http://127.0.0.1:") && !config.apiBaseUrl.endsWith(String(server.port))) {
        const inner = await referenceAdapter.create(config, hooks);
        const wrapped: SdkInstance = Object.create(inner);
        wrapped.getFinancialContribution = async () => {
          throw new Error("network down");
        };
        return wrapped;
      }
      return referenceAdapter.create(config, hooks);
    },
  };
  const err = await run(scenario("offline-with-cache"), broken).catch((e) => e);
  expect(err).toBeInstanceOf(ScenarioFailure);
  expect(String(err)).toMatch(/unexpected error/);
}, 30_000);

test.each([
  ["site-base-url-sign-in-loopback", /unexpected request GET \/connect\/ \(api\)/],
  ["site-base-url-checkout-url", /URL base/],
  ["site-base-url-checkout-signs-in-first", /unexpected request GET \/checkout\/ \(api\)/],
])("an SDK that ignores siteBaseUrl fails %s", async (id, message) => {
  const broken: SdkAdapter = {
    ...referenceAdapter,
    create: ({ siteBaseUrl: _ignored, ...config }, hooks) => referenceAdapter.create(config, hooks),
  };
  const err = await run(scenario(id), broken).catch((e) => e);
  expect(err).toBeInstanceOf(ScenarioFailure);
  expect(String(err)).toMatch(message);
}, 30_000);

test("an SDK that drops the site base path fails site-base-url-checkout-url", async () => {
  const broken: SdkAdapter = {
    ...referenceAdapter,
    create: (config, hooks) =>
      referenceAdapter.create({ ...config, ...(config.siteBaseUrl ? { siteBaseUrl: new URL(config.siteBaseUrl).origin } : {}) }, hooks),
  };
  const err = await run(scenario("site-base-url-checkout-url"), broken).catch((e) => e);
  expect(err).toBeInstanceOf(ScenarioFailure);
  expect(String(err)).toMatch(/URL base/);
}, 30_000);

test("an SDK that sends API calls to the site fails site-base-url-sign-in-loopback", async () => {
  const broken: SdkAdapter = {
    ...referenceAdapter,
    create: (config, hooks) =>
      referenceAdapter.create({ ...config, ...(config.siteBaseUrl ? { apiBaseUrl: config.siteBaseUrl } : {}) }, hooks),
  };
  const err = await run(scenario("site-base-url-sign-in-loopback"), broken).catch((e) => e);
  expect(err).toBeInstanceOf(ScenarioFailure);
}, 30_000);
