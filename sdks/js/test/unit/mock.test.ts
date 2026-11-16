import { describe, expect, test } from "bun:test";
import { MOCK_PRESET_NAMES, mockCheckoutContribution as refCheckout, mockResult as refResult } from "@sponsorkit/conformance";
import fixture from "@sponsorkit/conformance/fixtures/mock-presets.json";
import { targetsFromOptions } from "@sponsorkit/shared";
import { initialMockState, MOCK_PRESET_DATA, MOCK_PRESETS, mockCheckoutContribution, mockResult } from "../../src/mock";
import { Sponsorkit } from "../../src/node/index";
import { targetsFrom } from "../../src/targets";

const targetSets = [{ github: "octocat" }, { opencollective: "my-collective" }, { github: "octocat", opencollective: "my-collective" }];

describe("mock presets (SPEC §7.4)", () => {
  test("embedded data is identical to the conformance fixture", () => {
    expect(MOCK_PRESET_DATA).toEqual(fixture);
    expect([...MOCK_PRESETS]).toEqual([...MOCK_PRESET_NAMES]);
  });

  for (const set of targetSets) {
    for (const preset of MOCK_PRESETS) {
      test(`${preset} for ${Object.keys(set).join("+")} matches the reference expansion`, () => {
        const ours = mockResult(targetsFrom(set), initialMockState(targetsFrom(set), preset));
        expect(ours).toEqual(refResult(targetsFromOptions(set), preset));
      });
    }
    test(`checkout contribution for ${Object.keys(set).join("+")}`, () => {
      for (const opts of [
        {},
        { provider: "opencollective" as const, amount: 1200, currency: "EUR", frequency: "yearly" as const },
        { frequency: "one_time" as const },
      ]) {
        expect(mockCheckoutContribution(targetsFrom(set), opts)).toEqual(refCheckout(targetsFromOptions(set), opts));
      }
    });
  }

  test("custom contributions are returned as given", async () => {
    const [c] = refResult(targetsFromOptions({ github: "octocat" }), "active-monthly").contributions;
    const sk = new Sponsorkit({ github: "octocat", mock: { contributions: [c!] }, env: {} });
    const fc = await sk.getFinancialContribution();
    expect(fc.contributions).toEqual([c!]);
    expect(fc.signedIn).toBe(true);
    expect(fc.mock).toBe(true);
  });

  test("mock lifecycle and helpers", async () => {
    const sk = new Sponsorkit({ github: "octocat", mock: "org", env: {} });
    let fc = await sk.getFinancialContribution();
    expect(fc.active()).toHaveLength(1);
    expect(fc.direct()).toHaveLength(0);
    const r = await sk.openCheckout({ frequency: "one_time", amount: 700 });
    expect(r.status).toBe("contributed");
    fc = await sk.getFinancialContribution();
    expect(fc.oneTime()).toHaveLength(1);
    expect(fc.recurring()).toHaveLength(1);
    expect(fc.byProvider("github")).toHaveLength(2);
    await sk.signOut();
    expect(await sk.isSignedIn()).toBe(false);
    await sk.signIn();
    expect((await sk.getFinancialContribution()).contributions).toEqual([]);
  });

  test("SPONSORKIT_MOCK env and precedence", async () => {
    expect((await new Sponsorkit({ github: "octocat", env: { SPONSORKIT_MOCK: "one-time" } }).getFinancialContribution()).oneTime()).toHaveLength(1);
    expect(() => new Sponsorkit({ github: "octocat", env: { SPONSORKIT_MOCK: "nope" } })).toThrow(/Unknown mock preset/);
    const disabled = await new Sponsorkit({ github: "octocat", mock: "active-monthly", env: { SPONSORKIT_DISABLE: "TRUE" } }).getFinancialContribution();
    expect(disabled.disabled).toBe(true);
    expect(disabled.mock).toBe(false);
  });
});
