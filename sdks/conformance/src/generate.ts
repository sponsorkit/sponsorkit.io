/**
 * Generates every derived file of the kit (scenarios.json, JSON Schemas and the
 * canonical example fixtures). `bun run generate` writes them; a test asserts the
 * committed files are up to date.
 */
import { z } from "zod";
import {
  ContributionResult,
  Problem,
  TokenResponse,
  targetsFromParam,
  targetsHash,
  type ErrorCode,
} from "@sponsorkit/shared";
import { ControlOptions, ControlPatch, ControlRequest, MintSessionRequest } from "./control";
import { contributionId, pairwiseSupporterId, pkceChallenge } from "./crypto";
import { DEFAULT_TARGETS_PARAM, FAKE_IDENTITIES, defaultPool } from "./fixtures";
import { ScenariosFile } from "./scenario-schema";
import { buildScenariosFile } from "./scenarios";
import { StorageFile } from "./storage-schema";

const FETCHED_AT = "2026-11-16T18:00:00.000Z";

const stringify = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

function jsonSchema(schema: z.ZodType, title: string, io: "input" | "output" = "input"): unknown {
  return { title, ...z.toJSONSchema(schema, { io, unrepresentable: "any" }) };
}

async function exampleResults() {
  const targets = DEFAULT_TARGETS_PARAM.split(",");
  const hash = await targetsHash(targetsFromParam(DEFAULT_TARGETS_PARAM));
  const supporterId = await pairwiseSupporterId(hash, "github", FAKE_IDENTITIES.github.id);
  const gh = { ...FAKE_IDENTITIES.github, needsReconnect: false };
  const oc = { ...FAKE_IDENTITIES.opencollective, needsReconnect: false };
  const pool = defaultPool();
  const base = { signedIn: true, disabled: false, mock: false, targets, fetchedAt: FETCHED_AT, stale: false, fromCache: false };
  const full = ContributionResult.parse({ ...base, supporter: { id: supporterId, identities: [gh, oc] }, contributions: pool });
  const partial = ContributionResult.parse({
    ...base,
    supporter: { id: supporterId, identities: [gh, oc] },
    contributions: pool.filter((c) => c.provider !== "opencollective"),
    stale: true,
    unavailable: ["opencollective"],
  });
  const githubOnly = ContributionResult.parse({
    ...base,
    supporter: { id: supporterId, identities: [gh] },
    contributions: pool.filter((c) => c.provider === "github"),
  });
  const empty = { targets, supporter: null, contributions: [], fetchedAt: null, stale: false, fromCache: false, mock: false };
  const signedOut = ContributionResult.parse({ ...empty, signedIn: false, disabled: false });
  const disabled = ContributionResult.parse({ ...empty, signedIn: false, disabled: true });
  const token = TokenResponse.parse({
    sessionToken: "sks_AQAAAAAAAAAAAAAAAExampleOnlyNotARealSealedSessionToken",
    expiresAt: "2027-05-15T18:00:00.000Z",
    result: githubOnly,
  });
  return { full, partial, githubOnly, signedOut, disabled, token };
}

function problemExample(status: number, code: ErrorCode, title: string, detail: string) {
  return Problem.parse({ type: `https://sponsorkit.io/problems/${code}`, title, status, code, detail });
}

async function vectors() {
  const sets = [
    { input: { github: "sponsorkit-conformance", opencollective: "sponsorkit-conformance" } },
    { input: { github: "sponsorkit-conformance" } },
    { input: { opencollective: "sponsorkit-conformance" } },
    { input: { github: "  MathiasLorenzen ", opencollective: "Sponsorkit" } },
    { input: { github: "octocat" } },
  ];
  const targetSets = [];
  for (const s of sets) {
    const t = Object.entries(s.input).map(([p, a]) => `${p}:${a.trim().toLowerCase()}`).sort();
    const param = t.join(",");
    targetSets.push({ input: s.input, param, targetsHash: await targetsHash(targetsFromParam(param)) });
  }
  const verifiers = [
    "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", // RFC 7636 Appendix B
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "conformance~verifier.with-all_allowed-chars0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJ",
  ];
  const pkce = [];
  for (const v of verifiers) pkce.push({ codeVerifier: v, codeChallenge: await pkceChallenge(v) });
  const contributionIds = [];
  for (const [provider, externalId] of [
    ["github", "gh-sponsorship-1001"],
    ["github", "gh-sponsorship-1002"],
    ["opencollective", "oc-order-2001"],
    ["github", "gh-sponsorship-1003"],
    ["github", "gh-sponsorship-1004"],
  ] as const) {
    contributionIds.push({ provider, externalId, id: await contributionId(provider, externalId) });
  }
  return {
    $comment: "Test vectors every SDK should check its implementation against (PROTOCOL §1, §2; Contribution.id rule).",
    targetSets,
    invalidTargets: [
      { provider: "github", account: "-bad-" },
      { provider: "github", account: "bad-" },
      { provider: "github", account: "has--double" },
      { provider: "github", account: "a".repeat(40) },
      { provider: "github", account: "" },
      { provider: "opencollective", account: "bad slug!" },
      { provider: "opencollective", account: "-leading-hyphen" },
      { provider: "patreon", account: "someone" },
    ],
    pkce,
    contributionIds,
  };
}

/** Relative path (from sdks/conformance) -> file contents. */
export async function generateAll(): Promise<Record<string, string>> {
  // Validate, but keep the authored (input) form: defaults are documented in the schema, not expanded.
  const authored = buildScenariosFile();
  ScenariosFile.parse(authored);
  const r = await exampleResults();
  const storageExample = StorageFile.parse({
    v: 1,
    sessionToken: r.token.sessionToken,
    cache: { result: r.githubOnly, storedAt: "2026-11-16T18:00:01.000Z" },
    nags: { "my-cli": { runs: 3, lastShown: null }, "my-cli-weekly": { runs: 0, lastShown: "2026-11-10T09:00:00.000Z" } },
  });

  return {
    "scenarios.json": stringify(authored),
    "schemas/scenarios.schema.json": stringify(jsonSchema(ScenariosFile, "Sponsorkit conformance scenarios")),
    "schemas/storage-file.schema.json": stringify(jsonSchema(StorageFile, "Sponsorkit SDK storage file (PROTOCOL §8)", "output")),
    "schemas/control.schema.json": stringify(jsonSchema(ControlRequest, "POST /__control body")),
    "schemas/control-patch.schema.json": stringify(jsonSchema(ControlPatch, "PATCH /__control body")),
    "schemas/mint-session.schema.json": stringify(jsonSchema(MintSessionRequest, "POST /__control/sessions body")),
    "schemas/control-options.schema.json": stringify(jsonSchema(ControlOptions, "Fake server behaviour options")),
    "fixtures/vectors.json": stringify(await vectors()),
    "fixtures/contribution-result.json": stringify(r.full),
    "fixtures/contribution-result.partial.json": stringify(r.partial),
    "fixtures/contribution-result.signed-out.json": stringify(r.signedOut),
    "fixtures/contribution-result.disabled.json": stringify(r.disabled),
    "fixtures/token-response.json": stringify(r.token),
    "fixtures/storage-file.json": stringify(storageExample),
    "fixtures/problem.session-invalid.json": stringify(problemExample(401, "session_invalid", "Session invalid", "Unknown, malformed or expired session token")),
    "fixtures/problem.rate-limited.json": stringify(problemExample(429, "rate_limited", "Rate limited", "At most one refresh per 60 s per session")),
    "fixtures/problem.invalid-code.json": stringify(problemExample(400, "invalid_code", "Invalid code", "The code verifier does not match the code challenge")),
  };
}
