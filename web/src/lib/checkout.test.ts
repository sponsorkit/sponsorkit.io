import { describe, expect, it } from "vitest";
import { targetsFromParam, type TargetInfo, type TargetTier } from "@sponsorkit/shared";
import {
  currencyExponent,
  describeOffer,
  evaluateTarget,
  formatMoney,
  githubCheckoutUrl,
  openCollectiveCheckoutUrl,
  planCheckout,
  selectGitHubTier,
  toMajorUnits,
} from "./checkout";

/** The site base URL (origin + base path), as the page passes it. */
const ORIGIN = "https://sponsorkit.github.io/sponsorkit.io";

function tier(id: string, value: number, frequency: TargetTier["frequency"], url: string | null = null): TargetTier {
  return { id, name: `Tier ${id}`, amount: { value, currency: "USD" }, frequency, url };
}

/** A tier as the Worker returns it when it could decode the databaseId: with a `tier_id` url. */
function wtier(id: string, value: number, frequency: TargetTier["frequency"]): TargetTier {
  return tier(id, value, frequency, `https://github.com/sponsors/octocat/sponsorships?tier_id=${id}`);
}

function gh(over: Partial<TargetInfo> = {}): TargetInfo {
  return {
    target: "github:octocat",
    provider: "github",
    account: "octocat",
    exists: true,
    displayName: "The Octocat",
    avatarUrl: null,
    url: "https://github.com/sponsors/octocat",
    currency: "USD",
    frequencies: ["monthly", "one_time"],
    customAmount: false,
    tiers: [wtier("100", 500, "monthly"), wtier("101", 1000, "monthly"), wtier("102", 2500, "monthly"), wtier("200", 1000, "one_time")],
    ...over,
  };
}

function oc(over: Partial<TargetInfo> = {}): TargetInfo {
  return {
    target: "opencollective:sponsorkit",
    provider: "opencollective",
    account: "sponsorkit",
    exists: true,
    displayName: "Sponsorkit",
    avatarUrl: null,
    url: "https://opencollective.com/sponsorkit",
    currency: "EUR",
    frequencies: ["one_time", "monthly", "yearly"],
    customAmount: true,
    tiers: [],
    ...over,
  };
}

const both = targetsFromParam("github:octocat,opencollective:sponsorkit");

describe("evaluateTarget (PROTOCOL §6)", () => {
  it("rejects targets that don't exist", () => {
    const r = evaluateTarget(gh({ exists: false }), {});
    expect(r.eligible).toBe(false);
    expect(r.reasons.map((x) => x.code)).toEqual(["not_found"]);
    expect(r.reasons[0]?.message).toContain("@octocat");
  });

  it("checks frequency against TargetInfo.frequencies", () => {
    expect(evaluateTarget(gh(), { frequency: "yearly" }).reasons.map((r) => r.code)).toEqual(["frequency"]);
    expect(evaluateTarget(oc(), { frequency: "yearly" }).eligible).toBe(true);
  });

  it("checks currency; GitHub is always USD", () => {
    expect(evaluateTarget(gh({ currency: null }), { currency: "USD" }).eligible).toBe(true);
    expect(evaluateTarget(gh(), { currency: "EUR" }).reasons[0]?.message).toBe("Only accepts USD, not EUR.");
    expect(evaluateTarget(oc(), { currency: "eur" }).eligible).toBe(true);
    expect(evaluateTarget(oc(), { currency: "USD" }).reasons.map((r) => r.code)).toEqual(["currency"]);
    expect(evaluateTarget(oc({ currency: null }), { currency: "USD" }).eligible).toBe(false);
  });

  it("requires a GitHub tier for the frequency, or monthly by default", () => {
    expect(evaluateTarget(gh({ tiers: [tier("1", 500, "one_time")] }), {}).reasons.map((r) => r.code)).toEqual(["no_tiers"]);
    expect(evaluateTarget(gh({ tiers: [tier("1", 500, "one_time")] }), { frequency: "one_time" }).eligible).toBe(true);
    expect(evaluateTarget(gh({ tiers: [] }), { frequency: "monthly" }).reasons[0]?.message).toContain("no monthly tiers");
  });

  it("does not apply the tier rule to Open Collective", () => {
    expect(evaluateTarget(oc({ tiers: [] }), { frequency: "monthly" }).eligible).toBe(true);
  });

  it("reports every failing rule", () => {
    const r = evaluateTarget(gh(), { frequency: "yearly", currency: "EUR" });
    expect(r.reasons.map((x) => x.code)).toEqual(["frequency", "currency"]);
  });
});

describe("selectGitHubTier", () => {
  it("picks the cheapest tier at or above the amount", () => {
    expect(selectGitHubTier(gh(), { amount: 700 })?.id).toBe("101");
    expect(selectGitHubTier(gh(), { amount: 1000 })?.id).toBe("101");
    expect(selectGitHubTier(gh(), { amount: 500 })?.id).toBe("100");
  });
  it("falls back to the highest tier", () => {
    expect(selectGitHubTier(gh(), { amount: 99999 })?.id).toBe("102");
  });
  it("uses the frequency's tiers, monthly by default", () => {
    expect(selectGitHubTier(gh(), { amount: 100, frequency: "one_time" })?.id).toBe("200");
    expect(selectGitHubTier(gh(), {})?.id).toBe("100");
  });
  it("is independent of input order", () => {
    const tiers = [tier("3", 3000, "monthly"), tier("1", 100, "monthly"), tier("2", 2000, "monthly")];
    expect(selectGitHubTier(gh({ tiers }), { amount: 1500 })?.id).toBe("2");
  });
});

describe("githubCheckoutUrl", () => {
  it("prefers the tier's url", () => {
    const t = [tier("100", 500, "monthly", "https://github.com/sponsors/octocat/sponsorships?tier_id=100&x=1")];
    expect(githubCheckoutUrl(gh({ tiers: t }), {})).toBe("https://github.com/sponsors/octocat/sponsorships?tier_id=100&x=1");
  });
  it("never builds a tier_id link itself, even from a numeric id (PROTOCOL §6)", () => {
    const tiers = [tier("100", 500, "monthly"), tier("101", 1000, "monthly")];
    expect(githubCheckoutUrl(gh({ tiers }), { amount: 800 })).toBe("https://github.com/sponsors/octocat");
  });
  it("uses the selected tier's Worker-built url", () => {
    expect(githubCheckoutUrl(gh(), { amount: 800 })).toBe("https://github.com/sponsors/octocat/sponsorships?tier_id=101");
  });
  it("falls back to the sponsors page without tiers or with a null url", () => {
    expect(githubCheckoutUrl(gh({ tiers: [] }), {})).toBe("https://github.com/sponsors/octocat");
    expect(githubCheckoutUrl(gh({ tiers: [tier("ST_kwDO", 500, "monthly")] }), {})).toBe("https://github.com/sponsors/octocat");
  });
});

describe("Open Collective URL", () => {
  it("includes amount in major units, interval and redirect", () => {
    const url = new URL(openCollectiveCheckoutUrl(oc(), { amount: 550, frequency: "monthly" }, ORIGIN));
    expect(url.origin + url.pathname).toBe("https://opencollective.com/sponsorkit/donate");
    expect(url.searchParams.get("amount")).toBe("5.5");
    expect(url.searchParams.get("interval")).toBe("month");
    expect(url.searchParams.get("redirect")).toBe("https://sponsorkit.github.io/sponsorkit.io/checkout/thanks/");
  });
  it("uses interval=year and omits interval for one-time", () => {
    expect(new URL(openCollectiveCheckoutUrl(oc(), { frequency: "yearly" }, ORIGIN)).searchParams.get("interval")).toBe("year");
    const once = new URL(openCollectiveCheckoutUrl(oc(), { frequency: "one_time", amount: 500 }, ORIGIN));
    expect(once.searchParams.has("interval")).toBe(false);
    expect(once.searchParams.get("amount")).toBe("5");
  });
  it("omits amount when not given", () => {
    const url = openCollectiveCheckoutUrl(oc(), {}, ORIGIN);
    expect(url).toBe(`https://opencollective.com/sponsorkit/donate?redirect=${encodeURIComponent(`${ORIGIN}/checkout/thanks/`)}`);
  });
  it("uses ISO 4217 minor units where CLDR disagrees", () => {
    expect(new URL(openCollectiveCheckoutUrl(oc({ currency: "HUF" }), { amount: 150000 }, ORIGIN)).searchParams.get("amount")).toBe("1500");
    expect(new URL(openCollectiveCheckoutUrl(oc({ currency: "IQD" }), { amount: 1500 }, ORIGIN)).searchParams.get("amount")).toBe("1.5");
  });
  it("respects zero-decimal currencies", () => {
    const url = new URL(openCollectiveCheckoutUrl(oc({ currency: "JPY" }), { amount: 1000 }, ORIGIN));
    expect(url.searchParams.get("amount")).toBe("1000");
  });
});

describe("toMajorUnits", () => {
  it.each([
    [500, "USD", "5"],
    [550, "USD", "5.5"],
    [1999, "USD", "19.99"],
    [5, "USD", "0.05"],
    [1000, "JPY", "1000"],
    [1234, "KWD", "1.234"],
    // ISO 4217, not CLDR display digits (which say 0 for these).
    [150000, "HUF", "1500"],
    [1500050, "IDR", "15000.5"],
    [1500, "IQD", "1.5"],
    [123456, "COP", "1234.56"],
    [12345, "CLF", "1.2345"],
  ])("%i %s → %s", (minor, cur, expected) => {
    expect(toMajorUnits(minor, cur)).toBe(expected);
  });
  it("falls back to two decimals for unknown currencies", () => {
    expect(currencyExponent("ZZZ")).toBe(2);
    expect(currencyExponent("not a currency")).toBe(2);
  });
});

describe("formatMoney / describeOffer", () => {
  it("formats minor units", () => {
    expect(formatMoney(500, "USD", "en-US")).toBe("$5");
    expect(formatMoney(550, "USD", "en-US")).toBe("$5.50");
    expect(formatMoney(1000, "JPY", "en-US")).toBe("¥1,000");
  });
  it("describes the offer per provider", () => {
    const plan = planCheckout(both, [gh(), oc()], { frequency: "monthly", amount: 700 }, ORIGIN);
    const [g, o] = plan.options;
    expect(g && describeOffer(g, { frequency: "monthly", amount: 700 }, "en-US")).toBe("$10 a month · Tier 101");
    expect(o && describeOffer(o, { frequency: "monthly", amount: 700 }, "en-US")).toBe("€7 a month");
    expect(o && describeOffer(o, {}, "en-US")).toBe("Any amount, once or recurring");
  });
});

describe("planCheckout (PROTOCOL §4.6 step 2)", () => {
  it("redirects when exactly one provider is eligible", () => {
    const plan = planCheckout(both, [gh(), oc()], { frequency: "yearly" }, ORIGIN);
    expect(plan.action).toBe("redirect");
    if (plan.action === "redirect") {
      expect(plan.provider).toBe("opencollective");
      expect(plan.url).toContain("interval=year");
    }
  });

  it("shows the chooser when both are eligible", () => {
    const plan = planCheckout(both, [gh(), oc()], { frequency: "monthly" }, ORIGIN);
    expect(plan.action).toBe("choose");
    if (plan.action === "choose") {
      expect(plan.options.every((o) => o.eligible)).toBe(true);
      expect(plan.preferredUnavailable).toBeNull();
    }
  });

  it("redirects to the preferred provider when it is eligible", () => {
    const plan = planCheckout(both, [gh(), oc()], { frequency: "monthly", provider: "github", amount: 1000 }, ORIGIN);
    expect(plan).toMatchObject({ action: "redirect", provider: "github", url: "https://github.com/sponsors/octocat/sponsorships?tier_id=101" });
  });

  it("shows the chooser with reasons when the preferred provider is ineligible", () => {
    const plan = planCheckout(both, [gh(), oc()], { frequency: "yearly", provider: "github" }, ORIGIN);
    expect(plan.action).toBe("choose");
    if (plan.action === "choose") {
      expect(plan.preferredUnavailable).toBe("github");
      expect(plan.options.find((o) => o.provider === "github")?.reasons[0]?.code).toBe("frequency");
      expect(plan.options.find((o) => o.provider === "opencollective")?.eligible).toBe(true);
    }
  });

  it("shows the chooser with all options disabled when nothing is eligible", () => {
    const plan = planCheckout(both, [gh(), oc()], { currency: "GBP" }, ORIGIN);
    expect(plan.action).toBe("choose");
    expect(plan.options.map((o) => o.eligible)).toEqual([false, false]);
    expect(plan.options.every((o) => o.url === null)).toBe(true);
  });

  it("treats a target missing from /targets as not found", () => {
    const plan = planCheckout(both, [oc()], {}, ORIGIN);
    expect(plan.action).toBe("redirect");
    expect(plan.options[0]).toMatchObject({ provider: "github", eligible: false, info: null });
  });

  it("works for a single target", () => {
    const plan = planCheckout(targetsFromParam("github:octocat"), [gh()], {}, ORIGIN);
    expect(plan).toMatchObject({ action: "redirect", url: "https://github.com/sponsors/octocat/sponsorships?tier_id=100" });
  });
});
