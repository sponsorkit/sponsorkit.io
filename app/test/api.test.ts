import { ContributionResult, Problem, TargetsResponse, TokenResponse } from "@sponsorkit/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { CodePayload, SessionPayload, type SealedIdentity } from "../src/payloads";
import { resetHealthCache } from "../src/routes/api";
import { loadSealingKeys, seal, unseal } from "../src/seal";
import { OC_ME } from "./fixtures";
import { CHALLENGE, KEYS_V1, KEYS_V2, VERIFIER, call, fakeLimiter, installFakeProviders, makeEnv, newPkce, type FakeProviders } from "./helpers";

const TARGETS = "github:mathiaslorenzen,opencollective:sponsorkit";
const now = () => Math.floor(Date.now() / 1000);

const GH_ID: SealedIdentity = { p: "github", id: "583231", h: "alice", tok: "gho_good" };
const OC_ID: SealedIdentity = { p: "opencollective", id: OC_ME.id, h: "bob", tok: "oc_good", tx: now() + 86400 };

async function makeCode(over: Partial<CodePayload> = {}, keysJson = KEYS_V1): Promise<string> {
  const payload: CodePayload = { i: GH_ID, t: TARGETS, c: CHALLENGE, d: "paste", x: now() + 60, ...over };
  return seal("code", payload, await loadSealingKeys(keysJson));
}

async function makeSession(over: Partial<SessionPayload> = {}, keysJson = KEYS_V1): Promise<string> {
  const payload: SessionPayload = { v: 1, t: TARGETS, ids: [GH_ID], iat: now(), x: now() + 180 * 86400, ...over };
  return seal("session", payload, await loadSealingKeys(keysJson));
}

async function openSession(token: string, keysJson = KEYS_V1): Promise<SessionPayload> {
  return unseal("session", token, await loadSealingKeys(keysJson), SessionPayload);
}

async function expectProblem(res: Response, status: number, code: string): Promise<Problem> {
  expect(res.status).toBe(status);
  expect(res.headers.get("Content-Type")).toContain("application/problem+json");
  const body = Problem.parse(await res.json());
  expect(body.code).toBe(code);
  expect(body.status).toBe(status);
  return body;
}

const postToken = (body: unknown, env = makeEnv()) =>
  call("/api/v1/auth/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, env);

const getContributions = (token: string | null, env = makeEnv()) =>
  call("/api/v1/contributions", token ? { headers: { Authorization: `Bearer ${token}` } } : {}, env);

let fake: FakeProviders;
beforeEach(() => {
  fake = installFakeProviders();
  resetHealthCache();
});

describe("common behaviour", () => {
  it("adds request ids and CORS headers", async () => {
    const res = await call("/api/v1/health", { headers: { Origin: "https://app.example.com" } });
    expect(res.headers.get("Sponsorkit-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("Sponsorkit-Session");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("answers CORS preflight", async () => {
    const res = await call("/api/v1/contributions", {
      method: "OPTIONS",
      headers: { Origin: "https://app.example.com", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("returns not_found problems for unknown API paths", async () => {
    await expectProblem(await call("/api/v1/nope"), 404, "not_found");
    await expectProblem(await call("/api/other"), 404, "not_found");
  });

  it("serves no static assets: non-API paths are not_found problems", async () => {
    for (const path of ["/", "/connect/", "/connect/done/", "/checkout/", "/docs/", "/index.html"]) {
      const res = await call(path);
      await expectProblem(res, 404, "not_found");
      expect(res.headers.get("Sponsorkit-Request-Id")).toBeTruthy();
    }
  });

  it("sends no CORS headers on /api/oauth/*", async () => {
    const res = await call("/api/oauth/github/start", {
      method: "OPTIONS",
      headers: { Origin: "https://app.example.com", "Access-Control-Request-Method": "POST" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("problem types point at the HTTP API docs' error list on the site", async () => {
    const body = await expectProblem(await call("/api/v1/nope"), 404, "not_found");
    // Single origin (no site vars): the site is the API origin.
    expect(body.type).toBe("https://sponsorkit.test/docs/reference-http/http-api/#errors");
    const split = await expectProblem(await call("/api/v1/nope", {}, makeEnv({ PUBLIC_ORIGIN: "https://api.sponsorkit.io", SITE_BASE_URL: "https://sponsorkit.github.io/sponsorkit.io/" })), 404, "not_found");
    expect(split.type).toBe("https://sponsorkit.github.io/sponsorkit.io/docs/reference-http/http-api/#errors");
  });

  it("rate limits per IP with Retry-After", async () => {
    const env = makeEnv({ RL_IP: fakeLimiter(1) });
    expect((await call("/api/v1/health", {}, env)).status).toBe(200);
    const res = await call("/api/v1/health", {}, env);
    await expectProblem(res, 429, "rate_limited");
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});

describe("GET /api/v1/targets", () => {
  it("returns canonical TargetInfo for both providers, cacheable", async () => {
    const res = await call("/api/v1/targets?opencollective=Sponsorkit&github=MathiasLorenzen");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    const body = TargetsResponse.parse(await res.json());
    expect(body.targets.map((t) => t.target)).toEqual(["github:mathiaslorenzen", "opencollective:sponsorkit"]);
    expect(body.targets.every((t) => t.exists)).toBe(true);
  });

  it("returns exists:false for unknown targets", async () => {
    const body = TargetsResponse.parse(await (await call("/api/v1/targets?github=ghost-user&opencollective=missing-collective")).json());
    expect(body.targets.map((t) => t.exists)).toEqual([false, false]);
  });

  it("rejects malformed or missing targets", async () => {
    await expectProblem(await call("/api/v1/targets"), 400, "invalid_target");
    await expectProblem(await call("/api/v1/targets?github=-bad-"), 400, "invalid_target");
    await expectProblem(await call("/api/v1/targets?opencollective=" + "a".repeat(400)), 400, "invalid_target");
  });

  it("returns 502 internal when a provider is down", async () => {
    fake.override.set("api.github.test", () => new Response("down", { status: 503 }));
    await expectProblem(await call("/api/v1/targets?github=octocat"), 502, "internal");
  });

  it("limits uncached lookups per IP and in total (they spend the shared metadata token)", async () => {
    const perIp = fakeLimiter(2);
    const global = fakeLimiter(3);
    const env = makeEnv({ RL_TARGETS_MISS: perIp, RL_TARGETS_MISS_GLOBAL: global });
    const from = (ip: string) => ({ headers: { "CF-Connecting-IP": ip } });
    expect((await call("/api/v1/targets?github=user-a", from("1.1.1.1"), env)).status).toBe(200);
    expect((await call("/api/v1/targets?github=user-b", from("1.1.1.1"), env)).status).toBe(200);
    const blocked = await call("/api/v1/targets?github=user-c", from("1.1.1.1"), env);
    await expectProblem(blocked, 429, "rate_limited");
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect(perIp.calls).toEqual(["targets-miss:1.1.1.1", "targets-miss:1.1.1.1", "targets-miss:1.1.1.1"]);
    // Another IP still has its own budget, until the global one runs out.
    expect((await call("/api/v1/targets?github=user-d", from("2.2.2.2"), env)).status).toBe(200);
    await expectProblem(await call("/api/v1/targets?github=user-e", from("2.2.2.2"), env), 429, "rate_limited");
    expect(global.calls.every((k) => k === "targets-miss")).toBe(true);
    // Every lookup that reached a provider was allowed by both limits.
    expect(fake.requests.filter((r) => r.body.includes("SponsorkitTarget"))).toHaveLength(3);
  });

  it("returns 500 internal when the metadata token is missing", async () => {
    const body = await expectProblem(await call("/api/v1/targets?github=octocat", {}, makeEnv({ GITHUB_METADATA_TOKEN: undefined })), 500, "internal");
    expect(body.detail).not.toContain("GITHUB_METADATA_TOKEN");
  });
});

describe("POST /api/v1/auth/token", () => {
  it("exchanges a code for a session and a live result", async () => {
    const res = await postToken({ code: await makeCode(), codeVerifier: VERIFIER });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = TokenResponse.parse(await res.json());
    expect(body.sessionToken.startsWith("sks_")).toBe(true);
    const session = await openSession(body.sessionToken);
    expect(session).toMatchObject({ v: 1, t: TARGETS, ids: [GH_ID] });
    expect(session.x - session.iat).toBe(180 * 86400);
    expect(new Date(body.expiresAt).getTime()).toBe(session.x * 1000);
    expect(body.result).toMatchObject({ signedIn: true, disabled: false, mock: false, fromCache: false, stale: false, targets: TARGETS.split(",") });
    expect(body.result.supporter!.id).toMatch(/^sup_[a-z2-7]{32}$/);
    expect(body.result.supporter!.identities).toEqual([{ provider: "github", id: "583231", handle: "alice", needsReconnect: false }]);
    expect(body.result.contributions).toHaveLength(4);
    // Only the GitHub identity exists, so Open Collective is not queried at all.
    expect(fake.requests.some((r) => r.url.includes("oc.test"))).toBe(false);
  });

  it("rejects a wrong verifier, expired, tampered or foreign codes with invalid_code", async () => {
    const code = await makeCode();
    const other = await newPkce();
    await expectProblem(await postToken({ code, codeVerifier: other.verifier }), 400, "invalid_code");
    await expectProblem(await postToken({ code: await makeCode({ x: now() - 1 }), codeVerifier: VERIFIER }), 400, "invalid_code");
    await expectProblem(await postToken({ code: code.slice(0, -4) + "AAAA", codeVerifier: VERIFIER }), 400, "invalid_code");
    await expectProblem(await postToken({ code: "sks_" + code.slice(4), codeVerifier: VERIFIER }), 400, "invalid_code");
    await expectProblem(await postToken({ code: "nonsense", codeVerifier: VERIFIER }), 400, "invalid_code");
    await expectProblem(
      await postToken({ code: await makeCode({}, JSON.stringify([{ id: 9, key: "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk" }])), codeVerifier: VERIFIER }),
      400,
      "invalid_code",
    );
  });

  it("validates the request body", async () => {
    await expectProblem(await postToken({ code: "skc_x" }), 400, "invalid_request");
    await expectProblem(await postToken({ code: "skc_x", codeVerifier: "short" }), 400, "invalid_request");
    const res = await call("/api/v1/auth/token", { method: "POST", body: "{not json" });
    await expectProblem(res, 400, "invalid_request");
  });

  it("adds an identity to an existing session", async () => {
    const sessionToken = await makeSession();
    const code = await makeCode({ i: OC_ID });
    const res = await postToken({ code, codeVerifier: VERIFIER, sessionToken });
    expect(res.status).toBe(200);
    const body = TokenResponse.parse(await res.json());
    const session = await openSession(body.sessionToken);
    expect(session.ids.map((i) => i.p)).toEqual(["github", "opencollective"]);
    expect(body.result.supporter!.identities.map((i) => i.provider)).toEqual(["github", "opencollective"]);
    expect(body.result.contributions.filter((c) => c.provider === "opencollective")).toHaveLength(5);
    expect(body.result.contributions.filter((c) => c.provider === "github")).toHaveLength(4);
    // The pairwise id stays that of the original (first) identity.
    const before = TokenResponse.parse(await (await postToken({ code: await makeCode(), codeVerifier: VERIFIER })).json());
    expect(body.result.supporter!.id).toBe(before.result.supporter!.id);
  });

  it("replaces an identity of the same provider", async () => {
    const sessionToken = await makeSession({ ids: [GH_ID, OC_ID] });
    const newGh: SealedIdentity = { p: "github", id: "583231", h: "alice-renamed", tok: "gho_new" };
    const res = await postToken({ code: await makeCode({ i: newGh }), codeVerifier: VERIFIER, sessionToken });
    const session = await openSession(TokenResponse.parse(await res.json()).sessionToken);
    expect(session.ids).toEqual([newGh, OC_ID]);
  });

  it("rejects mismatched target sets and invalid sessions", async () => {
    const code = await makeCode({ i: OC_ID });
    await expectProblem(
      await postToken({ code, codeVerifier: VERIFIER, sessionToken: await makeSession({ t: "github:mathiaslorenzen" }) }),
      400,
      "invalid_request",
    );
    await expectProblem(await postToken({ code, codeVerifier: VERIFIER, sessionToken: "sks_garbage" }), 401, "session_invalid");
    await expectProblem(
      await postToken({ code, codeVerifier: VERIFIER, sessionToken: await makeSession({ x: now() - 1 }) }),
      401,
      "session_invalid",
    );
  });

  it("is rate limited per IP", async () => {
    const env = makeEnv({ RL_AUTH: fakeLimiter(0) });
    await expectProblem(await postToken({ code: "skc_x", codeVerifier: VERIFIER }, env), 429, "rate_limited");
  });
});

describe("GET /api/v1/contributions", () => {
  it("returns the live result for all identities", async () => {
    const res = await getContributions(await makeSession({ ids: [GH_ID, OC_ID] }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Sponsorkit-Session")).toBeNull();
    const body = ContributionResult.parse(await res.json());
    expect(body).toMatchObject({ signedIn: true, disabled: false, mock: false, fromCache: false, stale: false });
    expect(body.unavailable).toBeUndefined();
    expect(body.contributions).toHaveLength(9);
    expect(new Date(body.fetchedAt!).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it("returns partial results when one provider fails", async () => {
    fake.override.set("api.oc.test", () => new Response("bad gateway", { status: 502 }));
    const body = ContributionResult.parse(await (await getContributions(await makeSession({ ids: [GH_ID, OC_ID] }))).json());
    expect(body.stale).toBe(true);
    expect(body.unavailable).toEqual(["opencollective"]);
    expect(body.contributions.every((c) => c.provider === "github")).toBe(true);
    expect(body.supporter!.identities.every((i) => !i.needsReconnect)).toBe(true);
  });

  it("flags needsReconnect for revoked or expired provider tokens", async () => {
    const revoked: SealedIdentity = { ...GH_ID, tok: "gho_revoked" };
    const expiredOc: SealedIdentity = { ...OC_ID, tx: now() - 10 };
    const body = ContributionResult.parse(await (await getContributions(await makeSession({ ids: [revoked, expiredOc] }))).json());
    expect(body.stale).toBe(true);
    expect(body.unavailable).toEqual(["github", "opencollective"]);
    expect(body.supporter!.identities.map((i) => i.needsReconnect)).toEqual([true, true]);
    // The expired OC token is never sent to Open Collective.
    expect(fake.requests.some((r) => r.url.includes("oc.test"))).toBe(false);
  });

  it("rejects missing, malformed, tampered, expired and unknown-key sessions", async () => {
    await expectProblem(await getContributions(null), 401, "session_invalid");
    await expectProblem(await getContributions("sks_nope"), 401, "session_invalid");
    const good = await makeSession();
    await expectProblem(await getContributions(good.slice(0, -2) + (good.endsWith("A") ? "BB" : "AA")), 401, "session_invalid");
    await expectProblem(await getContributions(await makeSession({ x: now() - 1 })), 401, "session_invalid");
    await expectProblem(await getContributions(await makeCode()), 401, "session_invalid");
    const rotatedOut = await makeSession({}, JSON.stringify([{ id: 5, key: "BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU" }]));
    await expectProblem(await getContributions(rotatedOut), 401, "session_invalid");
  });

  it("renews sessions older than 7 days under the current key", async () => {
    const old = await makeSession({ iat: now() - 8 * 86400, x: now() + 100 * 86400 });
    const env = makeEnv({ SEALING_KEYS: KEYS_V2 });
    const res = await getContributions(old, env);
    expect(res.status).toBe(200);
    const renewed = res.headers.get("Sponsorkit-Session")!;
    expect(renewed.startsWith("sks_")).toBe(true);
    const payload = await openSession(renewed, KEYS_V2);
    expect(payload.iat).toBeGreaterThanOrEqual(now() - 1);
    expect(payload.x - payload.iat).toBe(180 * 86400);
    expect(payload.ids).toEqual([GH_ID]);
    // Sealed with key 2 (current), which the old key set can't open.
    await expect(openSession(renewed, KEYS_V1)).rejects.toThrow();
  });

  it("limits refreshes to one per minute per session (including renewed tokens)", async () => {
    const env = makeEnv({ RL_REFRESH: fakeLimiter(1) });
    const token = await makeSession();
    expect((await getContributions(token, env)).status).toBe(200);
    const again = await getContributions(await makeSession(), env); // a different token for the same session
    await expectProblem(again, 429, "rate_limited");
    expect(again.headers.get("Retry-After")).toBe("60");
    const other = await makeSession({ ids: [{ ...GH_ID, id: "1" }] });
    expect((await getContributions(other, env)).status).toBe(200);
  });

  it("is limited per IP (SPEC §8: 60/min), separately from the per-session refresh limit", async () => {
    const limiter = fakeLimiter(1);
    const env = makeEnv({ RL_CONTRIB_IP: limiter });
    const headers = (token: string) => ({ headers: { Authorization: `Bearer ${token}`, "CF-Connecting-IP": "3.3.3.3" } });
    expect((await call("/api/v1/contributions", headers(await makeSession()), env)).status).toBe(200);
    const other = await makeSession({ ids: [{ ...GH_ID, id: "2" }] });
    await expectProblem(await call("/api/v1/contributions", headers(other), env), 429, "rate_limited");
    expect(limiter.calls).toEqual(["contrib:3.3.3.3", "contrib:3.3.3.3"]);
  });

  it("never logs tokens", async () => {
    const lines: string[] = [];
    const orig = { log: console.log, warn: console.warn, error: console.error };
    console.log = console.warn = console.error = (s: unknown) => void lines.push(String(s));
    try {
      fake.override.set("api.oc.test", () => new Response("bad", { status: 500 }));
      const token = await makeSession({ ids: [GH_ID, OC_ID] });
      await getContributions(token);
      await postToken({ code: await makeCode(), codeVerifier: VERIFIER });
      const all = lines.join("\n");
      expect(lines.length).toBeGreaterThan(0);
      for (const secret of [token, "gho_good", "oc_good", VERIFIER]) expect(all).not.toContain(secret);
    } finally {
      Object.assign(console, orig);
    }
  });
});

describe("GET /api/v1/health", () => {
  it("reports provider reachability", async () => {
    const body = await (await call("/api/v1/health")).json();
    expect(body).toEqual({ ok: true, providers: { github: "ok", opencollective: "ok" } });
  });

  it("reports degraded providers", async () => {
    fake.override.set("api.github.test", () => new Response("down", { status: 503 }));
    const body = await (await call("/api/v1/health")).json();
    expect(body).toEqual({ ok: true, providers: { github: "degraded", opencollective: "ok" } });
  });
});
