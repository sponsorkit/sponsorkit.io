import { describe, expect, test } from "bun:test";
import vectors from "@sponsorkit/conformance/fixtures/vectors.json";
import { SponsorkitError } from "../../src/errors";
import { codeChallenge, createCodeVerifier, normalizeTarget, parseTarget, targetsFrom, targetsHash, targetsParam } from "../../src/targets";

describe("targets_hash vectors (PROTOCOL §1)", () => {
  for (const v of vectors.targetSets) {
    test(v.param, async () => {
      const targets = targetsFrom(v.input);
      expect(targetsParam(targets)).toBe(v.param);
      expect(await targetsHash(targets)).toBe(v.targetsHash);
      expect(await targetsHash(v.param)).toBe(v.targetsHash);
    });
  }
});

describe("invalid targets", () => {
  for (const v of vectors.invalidTargets) {
    test(`${v.provider}:${JSON.stringify(v.account)}`, () => {
      const err = (() => {
        try {
          normalizeTarget(v.provider, v.account);
        } catch (e) {
          return e;
        }
      })();
      expect(err).toBeInstanceOf(SponsorkitError);
      expect((err as SponsorkitError).code).toBe("invalid_config");
    });
  }

  test("target sets", () => {
    expect(() => targetsFrom({})).toThrow(SponsorkitError);
    expect(() => targetsFrom(["github:a", "github:b"])).toThrow(/one target per provider/);
    expect(() => parseTarget("nocolon")).toThrow(SponsorkitError);
    expect(targetsParam(targetsFrom("opencollective:B,github:A,github:a"))).toBe("github:a,opencollective:b");
  });
});

describe("PKCE (PROTOCOL §2)", () => {
  for (const v of vectors.pkce) {
    test(v.codeVerifier.slice(0, 12), async () => {
      expect(await codeChallenge(v.codeVerifier)).toBe(v.codeChallenge);
    });
  }

  test("verifiers are 43 base64url characters and random", () => {
    const a = createCodeVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createCodeVerifier()).not.toBe(a);
  });
});
