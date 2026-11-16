import { Contribution, TargetInfo } from "@sponsorkit/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CONTRIBUTIONS_QUERY as GH_CONTRIBUTIONS_QUERY,
  decodeGithubDatabaseId,
  githubAdapter,
  normalizeContributions as normalizeGh,
  normalizeTargetInfo as normalizeGhTarget,
} from "../src/providers/github";
import {
  CONTRIBUTIONS_QUERY as OC_CONTRIBUTIONS_QUERY,
  mapOrderStatus,
  normalizeContributions as normalizeOc,
  normalizeTargetInfo as normalizeOcTarget,
  opencollectiveAdapter,
  toMoney as ocToMoney,
} from "../src/providers/opencollective";
import { OAuthExchangeError, ProviderAuthError, ProviderError, providerFetch, readJson } from "../src/providers/types";
import { OC_ME, ghContributions, ghTarget, ocContributions, ocTarget } from "./fixtures";
import { installFakeProviders, makeEnv, type FakeProviders } from "./helpers";

const GH_TARGET = { provider: "github" as const, account: "mathiaslorenzen" };
const OC_TARGET = { provider: "opencollective" as const, account: "sponsorkit" };

describe("GitHub normalization", () => {
  it("maps sponsorships per SPEC §5.2, incl. org sponsorships", async () => {
    const out = await normalizeGh(ghContributions, GH_TARGET);
    for (const c of out) Contribution.parse(c);
    expect(out).toHaveLength(4);
    const [monthly, once, patreon, org] = out;
    expect(monthly).toMatchObject({
      provider: "github",
      target: "github:mathiaslorenzen",
      sponsor: { type: "user", provider: "github", id: "583231", handle: "alice" },
      via: "direct",
      kind: "recurring",
      frequency: "monthly",
      status: "active",
      amount: { value: 500, currency: "USD" },
      tier: { id: "ST_kwDOAAQ0Bs4AAZ8q", name: "$5 a month" },
      flags: [],
      private: false,
      startedAt: "2026-03-01T10:00:00.000Z",
      endedAt: null,
      lastChargedAt: null,
      nextChargeAt: null,
      totalContributed: null,
    });
    expect(monthly!.id).toMatch(/^con_github_[A-Za-z0-9_-]{22}$/);
    expect(once).toMatchObject({ kind: "one_time", frequency: "one_time", status: "paid", private: true, amount: { value: 2500 } });
    expect(patreon).toMatchObject({ status: "cancelled", flags: ["via_patreon"] });
    expect(org).toMatchObject({
      via: "organization",
      sponsor: { type: "organization", id: "9001", handle: "acme" },
      status: "active",
      amount: { value: 10000, currency: "USD" },
    });
  });

  it("is stable and deduplicates", async () => {
    const a = await normalizeGh(ghContributions, GH_TARGET);
    const b = await normalizeGh(ghContributions, GH_TARGET);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
  });

  it("filters sponsorships to other maintainers", async () => {
    expect(await normalizeGh(ghContributions, { provider: "github", account: "someoneelse" })).toEqual([]);
  });

  it("maps target info with tier deep links", () => {
    const info = TargetInfo.parse(normalizeGhTarget(ghTarget, GH_TARGET));
    expect(info).toMatchObject({
      target: "github:mathiaslorenzen",
      exists: true,
      displayName: "Mathias Lorenzen",
      currency: "USD",
      frequencies: ["monthly", "one_time"],
      customAmount: true,
      url: "https://github.com/sponsors/mathiaslorenzen",
    });
    expect(info.tiers[0]).toEqual({
      id: "ST_kwDOAAQ0Bs4AAZ8q",
      name: "$5 a month",
      amount: { value: 500, currency: "USD" },
      frequency: "monthly",
      url: "https://github.com/sponsors/mathiaslorenzen/sponsorships?tier_id=106282",
    });
    expect(info.tiers[1]!.frequency).toBe("one_time");
  });

  it("reports missing accounts / listings as exists:false", () => {
    expect(normalizeGhTarget({ repositoryOwner: null }, GH_TARGET)).toMatchObject({ exists: false, displayName: null, tiers: [], frequencies: [] });
    const noListing = { repositoryOwner: { ...ghTarget.repositoryOwner!, sponsorsListing: null } };
    expect(normalizeGhTarget(noListing, GH_TARGET)).toMatchObject({ exists: false, displayName: "Mathias Lorenzen" });
  });

  it("decodes tier database ids from node ids", () => {
    expect(decodeGithubDatabaseId("ST_kwDOAAQ0Bs4AAZ8q")).toBe(106282);
    expect(decodeGithubDatabaseId(btoa("012:SponsorsTier1234"))).toBe(1234);
    expect(decodeGithubDatabaseId("ST_!!!")).toBeNull();
    expect(decodeGithubDatabaseId("garbage")).toBeNull();
  });

  it("queries viewer + organizations sponsorships in one request", () => {
    expect(GH_CONTRIBUTIONS_QUERY).toContain("sponsorshipsAsSponsor(first: 100, activeOnly: false, maintainerLogins: $logins)");
    expect(GH_CONTRIBUTIONS_QUERY).toMatch(/organizations\(first: 100\)[\s\S]*sponsorshipsAsSponsor/);
  });
});

describe("Open Collective normalization", () => {
  const identity = { id: OC_ME.id, handle: OC_ME.slug };

  it("maps orders per SPEC §5.2, incl. incognito and administered accounts", async () => {
    const out = await normalizeOc(ocContributions, identity, OC_TARGET);
    for (const c of out) Contribution.parse(c);
    const byStatus = out.map((c) => [c.frequency, c.status]);
    expect(byStatus).toEqual([
      ["monthly", "active"],
      ["one_time", "paid"],
      ["yearly", "cancelled"],
      ["monthly", "pending"],
      ["monthly", "failed"],
    ]);
    expect(out[0]).toMatchObject({
      provider: "opencollective",
      target: "opencollective:sponsorkit",
      sponsor: { type: "user", provider: "opencollective", id: OC_ME.id, handle: "bob" },
      via: "direct",
      kind: "recurring",
      amount: { value: 1000, currency: "EUR" },
      tier: { id: "tier_backer", name: "Backer" },
      private: false,
      lastChargedAt: "2026-11-01T00:00:00.000Z",
      nextChargeAt: "2026-12-01T00:00:00.000Z",
      totalContributed: { value: 10000, currency: "EUR" },
    });
    expect(out[1]).toMatchObject({ kind: "one_time", private: true, tier: null, sponsor: { id: OC_ME.id } });
    expect(out[4]).toMatchObject({ via: "organization", sponsor: { type: "organization", id: "org_acme", handle: "acme-corp" } });
  });

  it("maps every documented status", () => {
    const expected: Record<string, string> = {
      ACTIVE: "active",
      PAID: "paid",
      PAUSED: "paused",
      CANCELLED: "cancelled",
      EXPIRED: "cancelled",
      REFUNDED: "refunded",
      DISPUTED: "disputed",
      ERROR: "failed",
      REJECTED: "failed",
      NEW: "pending",
      PENDING: "pending",
      PROCESSING: "pending",
      REQUIRE_CLIENT_CONFIRMATION: "pending",
      IN_REVIEW: "pending",
    };
    for (const [k, v] of Object.entries(expected)) expect(mapOrderStatus(k)).toBe(v);
    expect(mapOrderStatus(null)).toBe("pending");
  });

  it("maps target info", () => {
    const info = TargetInfo.parse(normalizeOcTarget(ocTarget, OC_TARGET));
    expect(info).toMatchObject({
      exists: true,
      displayName: "Sponsorkit",
      currency: "EUR",
      frequencies: ["one_time", "monthly", "yearly"],
      customAmount: true,
      url: "https://opencollective.com/sponsorkit",
    });
    expect(info.tiers.map((t) => [t.id, t.frequency, t.amount.value])).toEqual([
      ["tier_backer", "monthly", 500],
      ["tier_sponsor", "yearly", 10000],
    ]);
    expect(normalizeOcTarget({ account: null }, OC_TARGET)).toMatchObject({ exists: false, currency: null });
    expect(normalizeOcTarget({ account: { ...ocTarget.account!, type: "INDIVIDUAL" } }, OC_TARGET).exists).toBe(false);
  });

  it("reports accounts that don't accept contributions as exists:false", () => {
    // e.g. a plain ORGANIZATION profile (isActive:false), or an archived collective.
    for (const over of [{ type: "ORGANIZATION", isActive: false }, { isActive: false }, { isActive: null }, { isArchived: true }]) {
      const info = normalizeOcTarget({ account: { ...ocTarget.account!, ...over } }, OC_TARGET);
      expect(info, JSON.stringify(over)).toMatchObject({ exists: false, frequencies: [], customAmount: false, currency: null });
    }
    expect(normalizeOcTarget({ account: { ...ocTarget.account!, type: "ORGANIZATION", isActive: true } }, OC_TARGET).exists).toBe(true);
  });

  it("converts OC amounts (always major x 100) to ISO 4217 minor units", async () => {
    expect(ocToMoney({ valueInCents: 1999, currency: "EUR" })).toEqual({ value: 1999, currency: "EUR" });
    expect(ocToMoney({ valueInCents: 100000, currency: "JPY" })).toEqual({ value: 1000, currency: "JPY" });
    expect(ocToMoney({ valueInCents: 500000, currency: "KRW" })).toEqual({ value: 5000, currency: "KRW" });
    expect(ocToMoney({ valueInCents: 150, currency: "KWD" })).toEqual({ value: 1500, currency: "KWD" });

    const jpyOrder = { ...ocContributions.me!.orders!.nodes![0]!, amount: { valueInCents: 100000, currency: "JPY" }, totalContributed: { valueInCents: 300000, currency: "JPY" } };
    const data = { me: { ...ocContributions.me!, orders: { nodes: [jpyOrder] }, memberOf: { nodes: [] } } };
    const [c] = await normalizeOc(data, { id: OC_ME.id, handle: "bob" }, OC_TARGET);
    expect(c!.amount).toEqual({ value: 1000, currency: "JPY" });
    expect(c!.totalContributed).toEqual({ value: 3000, currency: "JPY" });

    const jpyTarget = {
      account: {
        ...ocTarget.account!,
        currency: "JPY",
        tiers: { nodes: [{ id: "t", slug: "t", name: "T", type: "TIER", frequency: "MONTHLY" as const, amountType: "FIXED" as const, amount: { valueInCents: 100000, currency: "JPY" } }] },
      },
    };
    expect(normalizeOcTarget(jpyTarget, OC_TARGET).tiers[0]!.amount).toEqual({ value: 1000, currency: "JPY" });
  });

  it("queries outgoing orders incl. incognito and administered accounts", () => {
    expect(OC_CONTRIBUTIONS_QUERY).toContain("orders(filter: OUTGOING, oppositeAccount: { slug: $slug }, includeIncognito: true");
    expect(OC_CONTRIBUTIONS_QUERY).toContain("memberOf(role: [ADMIN]");
  });
});

describe("adapters over HTTP", () => {
  let fake: FakeProviders;
  beforeEach(() => {
    fake = installFakeProviders();
  });

  it("github: authorize URL, exchange, identity, contributions", async () => {
    const gh = githubAdapter(makeEnv());
    const url = new URL(gh.authorizeUrl({ redirectUri: "https://sponsorkit.test/api/oauth/github/callback", state: "S", codeChallenge: "C" }));
    expect(url.origin + url.pathname).toBe("https://github.test/login/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "gh-client",
      redirect_uri: "https://sponsorkit.test/api/oauth/github/callback",
      scope: "read:user read:org",
      state: "S",
      code_challenge: "C",
      code_challenge_method: "S256",
      allow_signup: "false",
    });
    const tok = await gh.exchangeCode("good", "https://sponsorkit.test/cb", "v".repeat(43));
    expect(tok).toEqual({ accessToken: "gho_good" });
    await expect(gh.exchangeCode("bad", "https://sponsorkit.test/cb", "v".repeat(43))).rejects.toBeInstanceOf(OAuthExchangeError);
    expect(await gh.fetchIdentity("gho_good")).toEqual({ id: "583231", handle: "alice" });
    const contributions = await gh.fetchContributions("gho_good", { id: "583231", handle: "alice" }, GH_TARGET);
    expect(contributions).toHaveLength(4);
    const req = fake.requests.find((r) => r.body.includes("SponsorkitContributions"))!;
    expect(JSON.parse(req.body).variables).toEqual({ logins: ["mathiaslorenzen"] });
    expect(req.headers.get("User-Agent")).toBeTruthy();
    await expect(gh.fetchContributions("gho_revoked", { id: "1", handle: null }, GH_TARGET)).rejects.toBeInstanceOf(ProviderAuthError);
  });

  it("github: target info uses the metadata token; 5xx is a ProviderError", async () => {
    const gh = githubAdapter(makeEnv());
    const info = await gh.fetchTargetInfo(GH_TARGET);
    expect(info.exists).toBe(true);
    const req = fake.requests.at(-1)!;
    expect(req.headers.get("Authorization")).toBe("Bearer ghp_metadata");
    fake.override.set("api.github.test", () => new Response("oops", { status: 502 }));
    await expect(gh.fetchTargetInfo(GH_TARGET)).rejects.toBeInstanceOf(ProviderError);
  });

  it("opencollective: authorize URL, exchange with expiry, identity, contributions", async () => {
    const oc = opencollectiveAdapter(makeEnv());
    const url = new URL(oc.authorizeUrl({ redirectUri: "https://sponsorkit.test/api/oauth/opencollective/callback", state: "S", codeChallenge: "C" }));
    expect(url.origin + url.pathname).toBe("https://oc.test/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("orders incognito");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const before = Math.floor(Date.now() / 1000);
    const tok = await oc.exchangeCode("good", "https://sponsorkit.test/cb", "v".repeat(43));
    expect(tok.accessToken).toBe("oc_good");
    expect(tok.expiresAt).toBeGreaterThanOrEqual(before + 7776000);
    await expect(oc.exchangeCode("bad", "https://sponsorkit.test/cb", "v".repeat(43))).rejects.toBeInstanceOf(OAuthExchangeError);
    expect(await oc.fetchIdentity("oc_good")).toEqual({ id: OC_ME.id, handle: "bob" });
    expect(await oc.fetchContributions("oc_good", { id: OC_ME.id, handle: "bob" }, OC_TARGET)).toHaveLength(5);
    await expect(oc.fetchContributions("oc_revoked", { id: OC_ME.id, handle: "bob" }, OC_TARGET)).rejects.toBeInstanceOf(ProviderAuthError);
  });

  it("opencollective: target info is anonymous", async () => {
    const oc = opencollectiveAdapter(makeEnv());
    expect((await oc.fetchTargetInfo(OC_TARGET)).exists).toBe(true);
    expect(fake.requests.at(-1)!.headers.get("Authorization")).toBeNull();
    expect((await oc.fetchTargetInfo({ provider: "opencollective", account: "missing-collective" })).exists).toBe(false);
  });

  it("opencollective: a target that doesn't exist yields no contributions, not an outage", async () => {
    // OC resolves `oppositeAccount` with throwIfMissing, so the NotFound error nulls `me`.
    fake.override.set("api.oc.test", () =>
      Response.json({ data: { target: null, me: null }, errors: [{ message: "Account Not Found", path: ["me", "orders"], extensions: { code: "NotFound" } }] }),
    );
    const oc = opencollectiveAdapter(makeEnv());
    expect(await oc.fetchContributions("oc_good", { id: OC_ME.id, handle: "bob" }, { provider: "opencollective", account: "typo-collective" })).toEqual([]);
    expect(OC_CONTRIBUTIONS_QUERY).toContain("target: account(slug: $slug, throwIfMissing: false)");
    // Without the target lookup coming back null, a null `me` is still a provider failure.
    fake.override.set("api.oc.test", () => Response.json({ data: { target: { id: "x" }, me: null }, errors: [{ message: "boom" }] }));
    await expect(oc.fetchContributions("oc_good", { id: OC_ME.id, handle: "bob" }, OC_TARGET)).rejects.toBeInstanceOf(ProviderError);
  });

  it("the provider timeout also covers a body that stalls after the headers", async () => {
    fake.override.set("api.oc.test", () => {
      const stalled = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("{"));
        },
      });
      return new Response(stalled, { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const started = Date.now();
    const p = providerFetch("opencollective", "https://api.oc.test/graphql/v2", { method: "POST", body: "{}" }, 100).then((res) => readJson("opencollective", res));
    await expect(p).rejects.toMatchObject({ name: "ProviderError", message: "timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("network failures become ProviderError", async () => {
    fake.override.set("api.oc.test", () => {
      throw new TypeError("fetch failed");
    });
    const oc = opencollectiveAdapter(makeEnv());
    await expect(oc.fetchContributions("oc_good", { id: "x", handle: null }, OC_TARGET)).rejects.toBeInstanceOf(ProviderError);
    expect(await oc.ping()).toBe(false);
  });
});
