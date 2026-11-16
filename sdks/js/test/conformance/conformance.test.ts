/**
 * The Sponsorkit conformance kit (sdks/conformance), run against the Node entry
 * point. One test per scenario id in scenarios.json, sequentially, against one
 * fake server process.
 */
import { afterAll, beforeAll, describe, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadScenarios, runScenario } from "@sponsorkit/conformance";
import scenariosJson from "@sponsorkit/conformance/scenarios.json";
import { nodeAdapter } from "./adapter";
import { type FakeServer, spawnFakeServer } from "./server";

const file = loadScenarios(scenariosJson);
let server: FakeServer;
let storageRoot: string;

beforeAll(async () => {
  server = await spawnFakeServer();
  storageRoot = await mkdtemp(join(tmpdir(), "sponsorkit-js-conformance-"));
});

afterAll(async () => {
  await server?.stop();
  if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
});

describe("conformance", () => {
  for (const scenario of file.scenarios) {
    test(scenario.id, () => runScenario(scenario, nodeAdapter, { baseUrl: server.baseUrl, storageRoot, variables: file.variables }), 60_000);
  }
});
