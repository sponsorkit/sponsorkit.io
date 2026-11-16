import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ContributionResult, Problem, TargetsResponse, TokenResponse } from "@sponsorkit/shared";
import { base64url, pkceChallenge } from "../src/crypto";
import { DEFAULT_TARGETS_PARAM, NAMED_CONTRIBUTIONS } from "../src/fixtures";
import { startServer, type RunningServer } from "../src/server";

let server: RunningServer;
let base: string;

beforeAll(async () => {
  server = await startServer();
  base = server.baseUrl;
});
afterAll(() => server.stop());
beforeEach(async () => {
  await post("/__control/reset", {});
});

async function post(path: string, body: unknown, method = "POST") {
  return fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
const control = (body: unknown) => post("/__control", body);
const patch = (body: unknown) => post("/__control", body, "PATCH");
const state = async () => (await (await fetch(`${base}/__control`)).json()) as Record<string, unknown> & { issuedSessionTokens: string[] };
const requests = async (since = 0) =>
  ((await (await fetch(`${base}/__control/requests?since=${since}`)).json()) as { requests: { method: string; path: string; status: number; query: Record<string, string>; headers: Record<string, string>; body?: unknown; responseHeaders: Record<string, string> }[] }).requests;

async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  return { verifier, challenge: await pkceChallenge(verifier) };
}

function connectUrl(q: Record<string, string>, path = "/connect") {
  return `${base}${path}?${new URLSearchParams({ targets: DEFAULT_TARGETS_PARAM, ...q })}`;
}

/** Runs a one-shot loopback receiver and returns the redirect_uri plus a promise of the callback query. */
function loopbackReceiver(respond?: (q: URLSearchParams) => Response) {
  let resolve!: (q: URLSearchParams) => void;
  const received = new Promise<URLSearchParams>((r) => (resolve = r));
  const srv = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const q = new URL(req.url).searchParams;
      resolve(q);
      return respond ? respond(q) : new Response("You can close this window");
    },
  });
  return { redirectUri: `http://127.0.0.1:${srv.port}/callback`, received, stop: () => srv.stop(true) };
}

async function exchange(code: string, codeVerifier: string, sessionToken?: string) {
  return post("/api/v1/auth/token", { code, codeVerifier, ...(sessionToken ? { sessionToken } : {}) });
}

async function signIn(provider?: "github" | "opencollective", sessionToken?: string): Promise<string> {
  const { verifier, challenge } = await pkce();
  const res = await fetch(connectUrl({ challenge, delivery: "paste", ...(provider ? { provider } : {}) }));
  const code = (await res.text()).trim();
  const tok = await exchange(code, verifier, sessionToken);
  expect(tok.status).toBe(200);
  return TokenResponse.parse(await tok.json()).sessionToken;
}

const contributions = (token?: string) =>
  fetch(`${base}/api/v1/contributions`, token ? { headers: { authorization: `Bearer ${token}` } } : {});

describe("CLI", () => {
  test("prints exactly LISTENING <port> and serves", async () => {
    const proc = Bun.spawn(["bun", join(import.meta.dir, "..", "server.ts")], { stdout: "pipe", stderr: "pipe" });
    try {
      const reader = proc.stdout.getReader();
      let text = "";
      while (!text.includes("\n")) {
        const { value, done } = await reader.read();
        if (done) break;
        text += new TextDecoder().decode(value);
      }
      const m = /^LISTENING (\d+)\n$/.exec(text);
      expect(m).not.toBeNull();
      const res = await fetch(`http://127.0.0.1:${m![1]}/api/v1/health`);
      expect(await res.json()).toEqual({ ok: true, providers: { github: "ok", opencollective: "ok" } });
    } finally {
      proc.kill();
      await proc.exited;
    }
  });

  test("honours --port", async () => {
    const probe = Bun.serve({ port: 0, fetch: () => new Response() });
    const port = probe.port!;
    await probe.stop(true);
    const proc = Bun.spawn(["bun", join(import.meta.dir, "..", "server.ts"), "--port", String(port)], { stdout: "pipe" });
    try {
      const { value } = await proc.stdout.getReader().read();
      expect(new TextDecoder().decode(value)).toBe(`LISTENING ${port}\n`);
    } finally {
      proc.kill();
      await proc.exited;
    }
  });

  test("rejects unknown arguments", async () => {
    const proc = Bun.spawn(["bun", join(import.meta.dir, "..", "server.ts"), "--nope"], { stdout: "pipe", stderr: "pipe" });
    expect(await proc.exited).toBe(2);
  });
});

describe("common HTTP behaviour", () => {
  test("request id, CORS and preflight", async () => {
    const res = await fetch(`${base}/api/v1/health`);
    expect(res.headers.get("sponsorkit-request-id")).toMatch(/^req_/);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-expose-headers")).toContain("Sponsorkit-Session");
    const pre = await fetch(`${base}/api/v1/contributions`, { method: "OPTIONS" });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-headers")).toContain("Authorization");
  });

  test("unknown API route is a not_found problem", async () => {
    const res = await fetch(`${base}/api/v1/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    expect(Problem.parse(await res.json()).code).toBe("not_found");
  });
});

describe("GET /api/v1/targets", () => {
  test("known and unknown targets, canonical order, cacheable", async () => {
    const res = await fetch(`${base}/api/v1/targets?opencollective=Sponsorkit-Conformance&github=sponsorkit-conformance`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    const body = TargetsResponse.parse(await res.json());
    expect(body.targets.map((t) => t.target)).toEqual(DEFAULT_TARGETS_PARAM.split(","));
    expect(body.targets.every((t) => t.exists)).toBe(true);
    const missing = TargetsResponse.parse(await (await fetch(`${base}/api/v1/targets?github=nobody-here`)).json());
    expect(missing.targets[0]).toMatchObject({ target: "github:nobody-here", exists: false, tiers: [] });
  });

  test("malformed or missing parameters are invalid_target", async () => {
    for (const q of ["github=-bad-", "opencollective=bad%20slug", ""]) {
      const res = await fetch(`${base}/api/v1/targets?${q}`);
      expect(res.status).toBe(400);
      expect(Problem.parse(await res.json()).code).toBe("invalid_target");
    }
  });
});

describe("/connect and PKCE", () => {
  test("loopback delivers ?code= to redirect_uri and the code exchanges with the right verifier", async () => {
    const { verifier, challenge } = await pkce();
    const rx = loopbackReceiver();
    try {
      const res = await fetch(connectUrl({ challenge, delivery: "loopback", redirect_uri: rx.redirectUri, app_name: "x" }));
      expect(res.status).toBe(200);
      const q = await rx.received;
      const code = q.get("code")!;
      expect(code).toMatch(/^skc_/);
      expect((await (await fetch(`${base}/__control/codes/latest`)).json()).code).toBe(code);
      const tok = await exchange(code, verifier);
      expect(tok.status).toBe(200);
      const body = TokenResponse.parse(await tok.json());
      expect(body.sessionToken).toMatch(/^sks_/);
      expect(body.result.supporter?.identities.map((i) => i.provider)).toEqual(["github"]);
      expect(body.result.contributions.map((c) => c.provider)).toEqual(["github", "github"]);
    } finally {
      await rx.stop();
    }
  });

  test("paste returns the code as text/plain", async () => {
    const { challenge } = await pkce();
    const res = await fetch(connectUrl({ challenge, delivery: "paste" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/plain");
    const text = await res.text();
    expect(text).toMatch(/^skc_\S+\n$/);
    expect(res.headers.get("sponsorkit-conformance-code")).toBe(text.trim());
    const latest = await (await fetch(`${base}/__control/codes/latest`)).json();
    expect(latest).toMatchObject({ code: text.trim(), delivery: "paste", provider: "github", challenge });
    expect(Date.parse(latest.expiresAt) - Date.parse(latest.issuedAt)).toBe(600_000);
  });

  test("redirect and web_message deliveries", async () => {
    const { challenge } = await pkce();
    const r = await fetch(connectUrl({ challenge, delivery: "redirect", redirect_uri: "https://app.example.com/back?x=1" }), { redirect: "manual" });
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://app.example.com/back");
    expect(loc.searchParams.get("x")).toBe("1");
    expect(loc.searchParams.get("sponsorkit_code")).toMatch(/^skc_/);
    const w = await fetch(connectUrl({ challenge, delivery: "web_message", origin: "https://app.example.com" }), { redirect: "manual" });
    expect(w.headers.get("location")).toMatch(/^\/connect\/done#code=skc_[^&]+&origin=https%3A%2F%2Fapp.example.com$/);
  });

  test("a wrong verifier, unknown code or malformed verifier is invalid_code", async () => {
    const { challenge } = await pkce();
    const code = (await (await fetch(connectUrl({ challenge, delivery: "paste" }))).text()).trim();
    const other = await pkce();
    for (const [c, v] of [
      [code, other.verifier],
      ["skc_unknown", other.verifier],
      [code, "short"],
    ] as const) {
      const res = await exchange(c, v);
      expect(res.status).toBe(400);
      expect(Problem.parse(await res.json()).code).toBe("invalid_code");
    }
  });

  test("the verifier is checked with S256 (RFC 7636 appendix B vector)", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(await pkceChallenge(verifier)).toBe(challenge);
    const code = (await (await fetch(connectUrl({ challenge, delivery: "paste" }))).text()).trim();
    expect((await exchange(code, verifier)).status).toBe(200);
    // A "plain" client that sends the challenge itself as verifier is rejected.
    const code2 = (await (await fetch(connectUrl({ challenge, delivery: "paste" }))).text()).trim();
    expect((await exchange(code2, challenge)).status).toBe(400);
  });

  test("invalid /connect parameters are rejected with 400 HTML", async () => {
    const { challenge } = await pkce();
    const cases: Record<string, string>[] = [
      { challenge: "x", delivery: "paste" },
      { challenge, delivery: "carrier-pigeon" },
      { challenge, delivery: "loopback", redirect_uri: "http://localhost:8080/callback" },
      { challenge, delivery: "loopback", redirect_uri: "http://127.0.0.1:8080/other" },
      { challenge, delivery: "redirect", redirect_uri: "http://evil.example.com/" },
      { challenge, delivery: "web_message", origin: "https://app.example.com/path" },
      { challenge, delivery: "paste", provider: "patreon" },
      { challenge, delivery: "paste", app_name: "x".repeat(65) },
    ];
    for (const q of cases) {
      const res = await fetch(connectUrl(q));
      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toStartWith("text/html");
    }
    const nonCanonical = await fetch(`${base}/connect?${new URLSearchParams({ targets: "opencollective:sponsorkit-conformance,github:sponsorkit-conformance", challenge, delivery: "paste" })}`);
    expect(nonCanonical.status).toBe(400);
    expect(await nonCanonical.text()).toContain("canonical");
  });

  test("[::1] loopback redirect_uri is accepted", async () => {
    const { challenge } = await pkce();
    const res = await fetch(connectUrl({ challenge, delivery: "loopback", redirect_uri: "http://[::1]:9/callback" }), { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toStartWith("http://[::1]:9/callback?code=skc_");
  });

  test("connect.error delivers an error instead of a code", async () => {
    await control({ connect: { error: "access_denied" } });
    const { challenge } = await pkce();
    const r = await fetch(connectUrl({ challenge, delivery: "loopback", redirect_uri: "http://127.0.0.1:9/callback" }), { redirect: "manual" });
    expect(r.headers.get("location")).toBe("http://127.0.0.1:9/callback?error=access_denied");
    const p = await fetch(connectUrl({ challenge, delivery: "paste" }));
    expect(p.status).toBe(400);
    expect(await p.text()).toBe("error: access_denied\n");
  });
});

describe("sessions", () => {
  test("/contributions requires a valid bearer token", async () => {
    for (const res of [await contributions(), await contributions("sks_nope")]) {
      expect(res.status).toBe(401);
      expect(Problem.parse(await res.json()).code).toBe("session_invalid");
    }
    const token = await signIn();
    const res = await contributions(token);
    expect(res.status).toBe(200);
    const result = ContributionResult.parse(await res.json());
    expect(result).toMatchObject({ signedIn: true, disabled: false, mock: false, fromCache: false, stale: false });
    expect(result.unavailable).toBeUndefined();
  });

  test("adding a second identity merges into a new token", async () => {
    const first = await signIn();
    const second = await signIn("opencollective", first);
    expect(second).not.toBe(first);
    const result = ContributionResult.parse(await (await contributions(second)).json());
    expect(result.supporter?.identities.map((i) => i.provider)).toEqual(["github", "opencollective"]);
    expect(result.contributions.map((c) => c.id).sort()).toEqual(
      ["github-direct-monthly", "github-org-one-time", "opencollective-monthly"].map((n) => NAMED_CONTRIBUTIONS[n]!.id).sort(),
    );
    // Re-adding the same provider replaces the identity rather than duplicating it.
    const third = await signIn("github", second);
    const again = ContributionResult.parse(await (await contributions(third)).json());
    expect(again.supporter?.identities.map((i) => i.provider)).toEqual(["github", "opencollective"]);
    // The supporter id is stable for the same first identity and target set.
    expect(again.supporter?.id).toBe(result.supporter!.id);
  });

  test("a session for a different target set cannot be extended", async () => {
    const minted = (await (await post("/__control/sessions", { targets: "github:sponsorkit-conformance", identities: ["github"] })).json()) as { sessionToken: string };
    const { verifier, challenge } = await pkce();
    const code = (await (await fetch(connectUrl({ challenge, delivery: "paste", provider: "opencollective" }))).text()).trim();
    const res = await exchange(code, verifier, minted.sessionToken);
    expect(res.status).toBe(400);
    expect(Problem.parse(await res.json()).code).toBe("invalid_request");
    const bad = await exchange(code, verifier, "sks_garbage");
    expect(bad.status).toBe(401);
  });

  test("sessionInvalid rejects every token", async () => {
    const token = await signIn();
    await patch({ sessionInvalid: true });
    expect((await contributions(token)).status).toBe(401);
    await patch({ sessionInvalid: null });
    expect((await contributions(token)).status).toBe(200);
  });

  test("renewSession issues Sponsorkit-Session once; old token stays valid", async () => {
    const token = await signIn();
    await patch({ renewSession: { times: 1 } });
    const r1 = await contributions(token);
    const renewed = r1.headers.get("sponsorkit-session");
    expect(renewed).toMatch(/^sks_/);
    expect(renewed).not.toBe(token);
    expect((await state()).issuedSessionTokens).toEqual([token, renewed!]);
    const r2 = await contributions(renewed!);
    expect(r2.headers.get("sponsorkit-session")).toBeNull();
    expect((await contributions(token)).status).toBe(200);
  });

  test("minted sessions", async () => {
    const res = await post("/__control/sessions", { targets: DEFAULT_TARGETS_PARAM, identities: ["opencollective"] });
    const { sessionToken, expiresAt } = (await res.json()) as { sessionToken: string; expiresAt: string };
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(179 * 86400_000);
    const result = ContributionResult.parse(await (await contributions(sessionToken)).json());
    expect(result.contributions.map((c) => c.provider)).toEqual(["opencollective"]);
    const bad = await post("/__control/sessions", { targets: "github:sponsorkit-conformance", identities: ["opencollective"] });
    expect(bad.status).toBe(400);
  });
});

describe("control scenarios", () => {
  test("contributions fixture override by name or object", async () => {
    await control({ contributions: ["github-cancelled", NAMED_CONTRIBUTIONS["opencollective-monthly"]] });
    const token = await signIn();
    const result = ContributionResult.parse(await (await contributions(token)).json());
    expect(result.contributions.map((c) => c.status)).toEqual(["cancelled"]);
  });

  test("fail with 5xx, limited by times and endpoints", async () => {
    const token = await signIn();
    await control({ fail: { status: 502, times: 2 } });
    expect((await contributions(token)).status).toBe(502);
    const second = await contributions(token);
    expect(second.status).toBe(502);
    expect(Problem.parse(await second.json()).code).toBe("internal");
    expect((await contributions(token)).status).toBe(200);
    await control({ fail: { endpoints: ["token", "targets", "health"] } });
    expect((await fetch(`${base}/api/v1/health`)).status).toBe(503);
    expect((await fetch(`${base}/api/v1/targets?github=x`)).status).toBe(503);
    expect((await contributions(token)).status).toBe(200);
  });

  test("rate limit with Retry-After", async () => {
    const token = await signIn();
    await control({ rateLimit: { retryAfter: 42, times: 1 } });
    const res = await contributions(token);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(Problem.parse(await res.json()).code).toBe("rate_limited");
    expect((await contributions(token)).status).toBe(200);
  });

  test("partial outage of one provider", async () => {
    const first = await signIn();
    const token = await signIn("opencollective", first);
    await control({ outage: ["opencollective"] });
    const result = ContributionResult.parse(await (await contributions(token)).json());
    expect(result.stale).toBe(true);
    expect(result.unavailable).toEqual(["opencollective"]);
    expect(result.contributions.every((c) => c.provider === "github")).toBe(true);
    expect(await (await fetch(`${base}/api/v1/health`)).json()).toEqual({ ok: true, providers: { github: "ok", opencollective: "degraded" } });
    // An outage of a provider the session has no identity for is not reported.
    const ghOnly = await signIn();
    const r2 = ContributionResult.parse(await (await contributions(ghOnly)).json());
    expect(r2.stale).toBe(false);
  });

  test("needsReconnect", async () => {
    await control({ needsReconnect: ["github"] });
    const token = await signIn();
    const result = ContributionResult.parse(await (await contributions(token)).json());
    expect(result.supporter?.identities[0]?.needsReconnect).toBe(true);
  });

  test("newContribution appears after N calls once the checkout page was visited", async () => {
    await control({ newContribution: { contribution: "github-checkout-new", trigger: "checkout", afterCalls: 1 } });
    const token = await signIn();
    const ids = async () => ContributionResult.parse(await (await contributions(token)).json()).contributions.map((c) => c.id);
    const newId = NAMED_CONTRIBUTIONS["github-checkout-new"]!.id;
    expect(await ids()).not.toContain(newId); // not armed yet
    const page = await fetch(`${base}/checkout?${new URLSearchParams({ targets: DEFAULT_TARGETS_PARAM, provider: "github", amount: "1000", frequency: "monthly" })}`);
    expect(page.status).toBe(200);
    expect(page.url).toContain("/__fake/provider/github");
    expect(await ids()).not.toContain(newId); // 1st call after arming
    expect(await ids()).toContain(newId); // 2nd call
    expect(await ids()).toContain(newId); // sticky
    expect((await state()).checkoutVisits).toBe(1);
  });

  test("newContribution with the same id replaces the existing contribution", async () => {
    await control({ contributions: ["github-cancelled"], newContribution: { contribution: "github-cancelled-reactivated", trigger: "immediate" } });
    const token = await signIn();
    const result = ContributionResult.parse(await (await contributions(token)).json());
    expect(result.contributions).toHaveLength(1);
    expect(result.contributions[0]!.status).toBe("active");
  });

  test("scenario presets come from scenarios.json; unknown scenarios and options are rejected", async () => {
    const ok = await control({ scenario: "session-renewal" });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { behaviour: unknown }).behaviour).toEqual({ renewSession: { times: 1 } });
    const merged = await control({ scenario: "session-renewal", outage: ["github"] });
    expect(((await merged.json()) as { behaviour: unknown }).behaviour).toEqual({ renewSession: { times: 1 }, outage: ["github"] });
    expect((await control({ scenario: "no-such-scenario" })).status).toBe(400);
    expect((await control({ bogus: true })).status).toBe(400);
    expect((await control({ contributions: [{ id: "incomplete" }] })).status).toBe(400);
    expect((await control({ contributions: ["no-such-fixture"] })).status).toBe(400);
    expect((await control({ newContribution: { contribution: "no-such-fixture" } })).status).toBe(400);
  });

  test("PATCH merges and null removes", async () => {
    await control({ outage: ["github"], latencyMs: 1 });
    const res = await patch({ latencyMs: null, needsReconnect: ["github"] });
    expect(((await res.json()) as { behaviour: unknown }).behaviour).toEqual({ outage: ["github"], needsReconnect: ["github"] });
  });

  test("request log records method, path, query, a header subset and JSON bodies; control calls are excluded", async () => {
    const token = await signIn();
    await fetch(`${base}/api/v1/contributions?x=1`, { headers: { authorization: `Bearer ${token}`, cookie: "secret=1", "user-agent": "conformance-test" } });
    const log = await requests();
    expect(log.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /connect", "POST /api/v1/auth/token", "GET /api/v1/contributions"]);
    const last = log.at(-1)!;
    expect(last.query).toEqual({ x: "1" });
    expect(last.headers).toMatchObject({ authorization: `Bearer ${token}`, "user-agent": "conformance-test" });
    expect(last.headers.cookie).toBeUndefined();
    expect(last.status).toBe(200);
    expect(log[1]!.body).toMatchObject({ code: expect.stringMatching(/^skc_/), codeVerifier: expect.any(String) });
    const since = await requests((await state()).lastRequestSeq as number);
    expect(since).toEqual([]);
  });

  test("reset clears sessions, codes and the log", async () => {
    const token = await signIn();
    await post("/__control/reset", {});
    expect((await contributions(token)).status).toBe(401);
    expect((await fetch(`${base}/__control/codes/latest`)).status).toBe(404);
    expect((await requests()).map((r) => r.path)).toEqual(["/api/v1/contributions"]);
  });

  test("unreachable base URL refuses connections", async () => {
    const { baseUrl } = (await (await fetch(`${base}/__control/unreachable`)).json()) as { baseUrl: string };
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(await fetch(`${baseUrl}/api/v1/health`).then(() => "ok", () => "refused")).toBe("refused");
  });

  test("latencyMs delays API responses", async () => {
    await control({ latencyMs: 150 });
    const t = performance.now();
    await fetch(`${base}/api/v1/health`);
    expect(performance.now() - t).toBeGreaterThanOrEqual(140);
  });
});

describe("/checkout", () => {
  const checkout = (q: Record<string, string>) =>
    fetch(`${base}/checkout?${new URLSearchParams({ targets: DEFAULT_TARGETS_PARAM, ...q })}`, { redirect: "manual" });
  const providerTarget = (res: Response) => {
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!, base);
    return { provider: loc.pathname.split("/").at(-1), to: loc.searchParams.get("to") };
  };

  test("GitHub tier selection (PROTOCOL §6)", async () => {
    expect(providerTarget(await checkout({ provider: "github", amount: "700", frequency: "monthly" }))).toEqual({
      provider: "github",
      to: "https://github.com/sponsors/sponsorkit-conformance/sponsorships?tier_id=102",
    });
    expect(providerTarget(await checkout({ provider: "github", amount: "2000" })).to).toBe(
      "https://github.com/sponsors/sponsorkit-conformance/sponsorships?tier_id=103&preview=false",
    );
    expect(providerTarget(await checkout({ provider: "github", amount: "999999" })).to).toBe(
      "https://github.com/sponsors/sponsorkit-conformance/sponsorships?tier_id=103&preview=false",
    );
    expect(providerTarget(await checkout({ currency: "USD", frequency: "one_time" })).to).toBe(
      "https://github.com/sponsors/sponsorkit-conformance/sponsorships?tier_id=201",
    );
  });

  test("Open Collective donate URL", async () => {
    const t = providerTarget(await checkout({ amount: "550", currency: "EUR", frequency: "yearly" }));
    expect(t.provider).toBe("opencollective");
    const u = new URL(t.to!);
    expect(u.origin + u.pathname).toBe("https://opencollective.com/sponsorkit-conformance/donate");
    expect(Object.fromEntries(u.searchParams)).toEqual({ amount: "5.5", interval: "year", redirect: `${base}/checkout/thanks` });
    const oneTime = new URL(providerTarget(await checkout({ provider: "opencollective", frequency: "one_time" })).to!);
    expect(Object.fromEntries(oneTime.searchParams)).toEqual({ redirect: `${base}/checkout/thanks` });
  });

  test("chooser and ineligible pages", async () => {
    const both = await checkout({ amount: "500" });
    expect(both.status).toBe(200);
    expect(await both.text()).toContain("Choose a provider");
    await control({ checkoutChoice: "opencollective" });
    expect(providerTarget(await checkout({ amount: "500" })).provider).toBe("opencollective");
    const none = await checkout({ currency: "JPY" });
    expect(none.status).toBe(200);
    expect(await none.text()).toContain("No provider");
    const ineligible = await checkout({ provider: "github", frequency: "yearly" });
    expect(ineligible.status).toBe(200);
    expect(await ineligible.text()).toContain("does not accept yearly");
  });

  test("with a challenge, signs in first and continues with step=choose", async () => {
    const { verifier, challenge } = await pkce();
    const rx = loopbackReceiver(
      (q) => new Response(null, { status: 302, headers: { location: `${base}/checkout?${new URLSearchParams({ targets: DEFAULT_TARGETS_PARAM, provider: "github", amount: "500", step: "choose" })}` } }),
    );
    try {
      const res = await fetch(`${base}/checkout?${new URLSearchParams({ targets: DEFAULT_TARGETS_PARAM, provider: "github", amount: "500", challenge, delivery: "loopback", redirect_uri: rx.redirectUri })}`);
      expect(res.status).toBe(200);
      expect(res.url).toContain("/__fake/provider/github");
      const code = (await rx.received).get("code")!;
      expect((await exchange(code, verifier)).status).toBe(200);
      const latest = await (await fetch(`${base}/__control/codes/latest`)).json();
      expect(latest.via).toBe("checkout");
    } finally {
      await rx.stop();
    }
    // Paste: the response carries the continue URL.
    const paste = await fetch(`${base}/checkout?${new URLSearchParams({ targets: DEFAULT_TARGETS_PARAM, amount: "500", challenge, delivery: "paste" })}`);
    expect(paste.headers.get("sponsorkit-conformance-continue")).toBe(`/checkout?${new URLSearchParams({ targets: DEFAULT_TARGETS_PARAM, amount: "500" })}&step=choose`);
  });

  test("invalid checkout params", async () => {
    for (const q of <Record<string, string>[]>[{ amount: "5.00" }, { currency: "eur" }, { frequency: "weekly" }, { provider: "patreon" }, { step: "pay" }]) {
      expect((await checkout(q)).status).toBe(400);
    }
  });
});
