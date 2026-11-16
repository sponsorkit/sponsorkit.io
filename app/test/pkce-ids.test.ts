import { describe, expect, it } from "vitest";
import { base32Lower, base64urlDecode, base64urlEncode, utf8 } from "../src/encoding";
import { contributionId, supporterId } from "../src/ids";
import { challengeFor, generateVerifier, isValidVerifier, verifyChallenge } from "../src/pkce";
import { CHALLENGE, VERIFIER, makeEnv } from "./helpers";

describe("pkce", () => {
  it("matches the RFC 7636 appendix B vector", async () => {
    expect(await challengeFor(VERIFIER)).toBe(CHALLENGE);
    expect(await verifyChallenge(VERIFIER, CHALLENGE)).toBe(true);
  });

  it("rejects a wrong or malformed verifier", async () => {
    const other = generateVerifier();
    expect(other).toHaveLength(43);
    expect(isValidVerifier(other)).toBe(true);
    expect(await verifyChallenge(other, CHALLENGE)).toBe(false);
    expect(await verifyChallenge("short", CHALLENGE)).toBe(false);
    expect(await verifyChallenge(VERIFIER + " ", CHALLENGE)).toBe(false);
    expect(await verifyChallenge(VERIFIER, "x")).toBe(false);
  });
});

describe("encoding", () => {
  it("base32 matches RFC 4648 vectors (lowercase, no padding)", () => {
    const vectors: Array<[string, string]> = [
      ["", ""],
      ["f", "my"],
      ["fo", "mzxq"],
      ["foo", "mzxw6"],
      ["foob", "mzxw6yq"],
      ["fooba", "mzxw6ytb"],
      ["foobar", "mzxw6ytboi"],
    ];
    for (const [input, out] of vectors) expect(base32Lower(utf8(input))).toBe(out);
  });

  it("base64url round-trips and rejects invalid input", () => {
    const bytes = new Uint8Array([0, 255, 254, 62, 63, 1]);
    expect(base64urlDecode(base64urlEncode(bytes))).toEqual(bytes);
    expect(() => base64urlDecode("a+b/")).toThrow();
    expect(() => base64urlDecode("abcde")).toThrow();
  });
});

describe("ids", () => {
  it("supporter ids are pairwise and stable", async () => {
    const env = makeEnv();
    const a = await supporterId(env, "github:mathiaslorenzen", "github", "583231");
    expect(a).toMatch(/^sup_[a-z2-7]{32}$/);
    expect(await supporterId(env, "github:mathiaslorenzen", "github", "583231")).toBe(a);
    expect(await supporterId(env, "github:other", "github", "583231")).not.toBe(a);
    expect(await supporterId(env, "github:mathiaslorenzen", "github", "583232")).not.toBe(a);
    expect(await supporterId(makeEnv({ PAIRWISE_KEY: "other" }), "github:mathiaslorenzen", "github", "583231")).not.toBe(a);
  });

  it("supporter id = sup_ + base32(HMAC(key, targetsHash|provider|id)[0..20])", async () => {
    const env = makeEnv();
    const th = [...new Uint8Array(await crypto.subtle.digest("SHA-256", utf8("github:x")))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const key = await crypto.subtle.importKey("raw", utf8(env.PAIRWISE_KEY!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(`${th}|github|42`)));
    expect(await supporterId(env, "github:x", "github", "42")).toBe("sup_" + base32Lower(mac.slice(0, 20)));
  });

  it("contribution ids follow the shared doc comment", async () => {
    const id = await contributionId("github", "S_abc");
    const digest = base64urlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8("github:S_abc"))));
    expect(id).toBe(`con_github_${digest.slice(0, 22)}`);
    expect(await contributionId("opencollective", "S_abc")).not.toBe(id);
  });
});
