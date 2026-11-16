import { expect, test } from "bun:test";
import { targetsFromOptions, targetsToParam, targetsHash, parseTargetString } from "./targets";

test("canonical target param", () => {
  const t = targetsFromOptions({ opencollective: "Sponsorkit", github: "MathiasLorenzen" });
  expect(targetsToParam(t)).toBe("github:mathiaslorenzen,opencollective:sponsorkit");
});
test("targets hash is stable", async () => {
  const h = await targetsHash(targetsFromOptions({ github: "octocat" }));
  expect(h).toMatch(/^[0-9a-f]{64}$/);
});
test("rejects bad logins", () => {
  expect(() => parseTargetString("github:-bad")).toThrow();
  expect(() => parseTargetString("patreon:x")).toThrow();
});
