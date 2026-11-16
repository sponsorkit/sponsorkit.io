import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  Contribution,
  ContributionResult,
  Problem,
  TargetsResponse,
  TokenResponse,
  normalizeTarget,
  parseTargetString,
  targetsFromOptions,
  targetsHash,
  targetsToParam,
} from "@sponsorkit/shared";
import { contributionId, pkceChallenge } from "../src/crypto";
import { DEFAULT_TARGETS_PARAM, KNOWN_TARGETS, NAMED_CONTRIBUTIONS } from "../src/fixtures";
import { generateAll } from "../src/generate";
import { MOCK_PRESETS, MOCK_PRESET_NAMES, mockCheckoutContribution, mockResult } from "../src/mock-presets";
import { ScenariosFile } from "../src/scenario-schema";
import { DEFAULT_TARGETS_HASH, GITHUB_ONLY_HASH } from "../src/scenarios";
import { FakeSponsorkit, loadScenarioServerBlocks } from "../src/server";
import { StorageFile } from "../src/storage-schema";

const root = join(import.meta.dir, "..");
const readJson = async (rel: string) => JSON.parse(await Bun.file(join(root, rel)).text());

describe("fixtures validate against @sponsorkit/shared", () => {
  test.each([
    ["fixtures/contribution-result.json", ContributionResult],
    ["fixtures/contribution-result.partial.json", ContributionResult],
    ["fixtures/contribution-result.signed-out.json", ContributionResult],
    ["fixtures/contribution-result.disabled.json", ContributionResult],
    ["fixtures/token-response.json", TokenResponse],
    ["fixtures/targets-response.json", TargetsResponse],
    ["fixtures/targets-response.missing.json", TargetsResponse],
    ["fixtures/problem.session-invalid.json", Problem],
    ["fixtures/problem.rate-limited.json", Problem],
    ["fixtures/problem.invalid-code.json", Problem],
    ["fixtures/storage-file.json", StorageFile],
  ] as const)("%s", async (path, schema) => {
    const data = await readJson(path);
    const parsed = schema.parse(data);
    // Strict round trip: no unknown keys hidden by Zod's default stripping.
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(data);
  });

  test("every named contribution is a valid Contribution with a rule-conformant id", async () => {
    const vectors = await readJson("fixtures/vectors.json");
    const ids = new Set(vectors.contributionIds.map((v: { id: string }) => v.id));
    for (const [name, c] of Object.entries(NAMED_CONTRIBUTIONS)) {
      expect(Contribution.parse(c)).toEqual(c);
      expect(ids.has(c.id)).toBe(true);
      expect(c.id.startsWith(`con_${c.provider}_`)).toBe(true);
      expect(c.sponsor.provider).toBe(c.provider);
      expect(c.target.startsWith(`${c.provider}:`)).toBe(true);
      expect(KNOWN_TARGETS.has(c.target)).toBe(true);
      expect(c.kind === "one_time").toBe(c.frequency === "one_time");
      if (c.via === "organization") expect(c.sponsor.type).toBe("organization");
      void name;
    }
  });

  test("target fixtures follow PROTOCOL §1 and §6 conventions", () => {
    for (const t of KNOWN_TARGETS.values()) {
      expect(parseTargetString(t.target)).toEqual({ provider: t.provider, account: t.account });
      for (const tier of t.tiers) expect(tier.amount.currency).toBe(t.currency!);
      if (t.provider === "github") {
        expect(t.currency).toBe("USD");
        expect(t.frequencies).toEqual(["monthly", "one_time"]);
        for (const tier of t.tiers) expect(tier.id).toMatch(/^\d+$/);
      } else {
        expect(t.frequencies).toEqual(["one_time", "monthly", "yearly"]);
        expect(t.customAmount).toBe(true);
      }
    }
  });
});

describe("vectors.json", () => {
  test("targets_hash vectors match @sponsorkit/shared", async () => {
    const v = await readJson("fixtures/vectors.json");
    for (const s of v.targetSets) {
      const targets = targetsFromOptions(s.input);
      expect(targetsToParam(targets)).toBe(s.param);
      expect(await targetsHash(targets)).toBe(s.targetsHash);
    }
    expect(v.targetSets[0].targetsHash).toBe(DEFAULT_TARGETS_HASH);
    expect(v.targetSets[1].targetsHash).toBe(GITHUB_ONLY_HASH);
    expect(v.targetSets[0].param).toBe(DEFAULT_TARGETS_PARAM);
  });

  test("invalid targets are rejected", async () => {
    const v = await readJson("fixtures/vectors.json");
    for (const t of v.invalidTargets) expect(() => normalizeTarget(t.provider, t.account)).toThrow();
  });

  test("PKCE vectors (incl. RFC 7636 appendix B)", async () => {
    const v = await readJson("fixtures/vectors.json");
    expect(v.pkce[0]).toEqual({ codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" });
    for (const p of v.pkce) expect(await pkceChallenge(p.codeVerifier)).toBe(p.codeChallenge);
  });

  test("contribution id vectors", async () => {
    const v = await readJson("fixtures/vectors.json");
    for (const c of v.contributionIds) expect(await contributionId(c.provider, c.externalId)).toBe(c.id);
  });
});

describe("mock presets", () => {
  test("the file defines exactly the SPEC §7.4 presets", () => {
    expect(Object.keys(MOCK_PRESETS.presets).sort()).toEqual([...MOCK_PRESET_NAMES].sort());
  });

  test.each([
    ["github:octocat"],
    ["opencollective:webpack"],
    ["github:sponsorkit-conformance,opencollective:sponsorkit-conformance"],
  ])("every preset expands to a valid result for %s", (param) => {
    const targets = param.split(",").map(parseTargetString);
    for (const name of MOCK_PRESET_NAMES) {
      const r = mockResult(targets, name);
      expect(ContributionResult.parse(r)).toEqual(r);
      expect(r.mock).toBe(true);
      expect(r.targets).toEqual(param.split(","));
      expect(r.signedIn).toBe(name !== "signed-out");
      expect(r.supporter === null).toBe(name === "signed-out");
      for (const c of r.contributions) {
        expect(c.target).toBe(param.split(",")[0]!);
        expect(c.provider).toBe(targets[0]!.provider);
        expect(c.id).not.toContain("{");
      }
    }
  });

  test("checkout simulation", () => {
    const targets = DEFAULT_TARGETS_PARAM.split(",").map(parseTargetString);
    expect(mockCheckoutContribution(targets)).toMatchObject({ provider: "github", amount: { value: 500, currency: "USD" }, frequency: "monthly", kind: "recurring", status: "active" });
    expect(mockCheckoutContribution(targets, { provider: "opencollective", frequency: "one_time", amount: 700, currency: "EUR" })).toMatchObject({
      id: "con_opencollective_mock_checkout",
      target: "opencollective:sponsorkit-conformance",
      kind: "one_time",
      status: "paid",
      amount: { value: 700, currency: "EUR" },
    });
  });
});

describe("generated files", () => {
  test("are up to date (run `bun run generate`)", async () => {
    const files = await generateAll();
    for (const [rel, content] of Object.entries(files)) {
      expect({ file: rel, content: await Bun.file(join(root, rel)).text() }).toEqual({ file: rel, content });
    }
  });

  test("every schema file is a JSON Schema", async () => {
    for (const name of await readdir(join(root, "schemas"))) {
      const s = await readJson(`schemas/${name}`);
      expect(s.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(typeof s.title).toBe("string");
    }
  });
});

describe("scenarios.json", () => {
  test("validates and every server/control block is accepted by the fake server", async () => {
    const file = ScenariosFile.parse(await readJson("scenarios.json"));
    const blocks = await loadScenarioServerBlocks();
    const fake = new FakeSponsorkit({ scenarios: blocks });
    for (const s of file.scenarios) {
      fake.applyControl({ scenario: s.id });
      for (const step of s.steps) if (step.action === "control") fake.patchControl(step.args);
    }
  });

  test("server output matches fixtures/contribution-result.json (except fetchedAt)", async () => {
    const fake = new FakeSponsorkit();
    const { sessionToken } = await fake.mintSession({ targets: DEFAULT_TARGETS_PARAM, identities: ["github", "opencollective"] });
    const res = await fake.fetch(new Request("http://127.0.0.1/api/v1/contributions", { headers: { authorization: `Bearer ${sessionToken}` } }));
    const body = ContributionResult.parse(await res.json());
    const fixture = ContributionResult.parse(await readJson("fixtures/contribution-result.json"));
    expect({ ...body, fetchedAt: fixture.fetchedAt }).toEqual(fixture);
  });
});
