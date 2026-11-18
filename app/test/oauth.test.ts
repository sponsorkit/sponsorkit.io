import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { base64urlEncode } from "../src/encoding";
import { CodePayload, StatePayload } from "../src/payloads";
import { NONCE_COOKIE } from "../src/routes/oauth";
import { loadSealingKeys, seal, unseal } from "../src/seal";
import type { Env } from "../src/env";
import { CHALLENGE, KEYS_V1, ORIGIN, call, fakeLimiter, getCookie, installFakeProviders, makeEnv, type FakeProviders } from "./helpers";

const TARGETS = "github:mathiaslorenzen,opencollective:sponsorkit";

/** Two-origin deployment, as in production (PROTOCOL §0): site on Pages, API on its own host. */
const SPLIT = {
  PUBLIC_ORIGIN: "https://api.sponsorkit.test",
  SITE_BASE_URL: "https://pages.test/sponsorkit.io/",
  SITE_ORIGIN: "https://pages.test",
} as const;
const SPLIT_SITE = "https://pages.test/sponsorkit.io";

function startForm(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams({ targets: TARGETS, challenge: CHALLENGE, ...params });
}

/** The consent page's top-level form POST (PROTOCOL §4.2 step 3). By default it comes from the site origin. */
function postStart(
  provider: string,
  params: Record<string, string> | URLSearchParams | string,
  opts: { origin?: string | null; headers?: Record<string, string>; env?: Env; contentType?: string; query?: string } = {},
) {
  const headers: Record<string, string> = { "Content-Type": opts.contentType ?? "application/x-www-form-urlencoded", ...opts.headers };
  const origin = opts.origin === undefined ? ORIGIN : opts.origin;
  if (origin !== null) headers.Origin = origin;
  const body = typeof params === "string" ? params : (params instanceof URLSearchParams ? params : startForm(params)).toString();
  return call(`/api/oauth/${provider}/start${opts.query ?? ""}`, { method: "POST", headers, body }, opts.env);
}

async function start(provider: string, params: Record<string, string>, env?: Env, origin?: string) {
  const res = await postStart(provider, params, { env, origin });
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("Location")!);
  const nonce = getCookie(res, NONCE_COOKIE)!;
  return { res, location, nonce, state: location.searchParams.get("state")! };
}

async function callback(provider: string, query: Record<string, string>, nonce: string | null, env?: Env) {
  const headers: Record<string, string> = {};
  if (nonce !== null) headers.Cookie = `other=1; ${NONCE_COOKIE}=${nonce}`;
  return call(`/api/oauth/${provider}/callback?${new URLSearchParams(query)}`, { headers }, env);
}

async function decodeCode(skc: string) {
  return unseal("code", skc, await loadSealingKeys(KEYS_V1), CodePayload);
}

function linkIn(html: string): URL {
  return new URL(/<a href="([^"]+)"/.exec(html)![1]!.replaceAll("&amp;", "&"));
}

function expectNoSideEffects(res: Response) {
  expect(res.headers.get("Content-Type")).toContain("text/html");
  expect(res.headers.get("Location")).toBeNull();
  expect(res.headers.get("Set-Cookie")).toBeNull();
}

describe("POST /api/oauth/:provider/start", () => {
  beforeEach(() => {
    installFakeProviders();
  });

  it("sets the nonce cookie, seals the state and redirects to GitHub", async () => {
    const { res, location, nonce, state } = await start("github", { delivery: "web_message", origin: "https://app.example.com", app_name: "demo" });
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith(NONCE_COOKIE))!;
    // The cookie outlives the 600 s state so an expired flow can still be reported (PROTOCOL §4.4).
    expect(cookie).toMatch(/; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=1200$/);
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.origin + location.pathname).toBe("https://github.test/login/oauth/authorize");
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/oauth/github/callback`);
    expect(location.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.get("code_challenge")).not.toBe(CHALLENGE); // the provider PKCE pair is the Worker's own
    expect(res.headers.get("Sponsorkit-Request-Id")).toBeTruthy();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull(); // no CORS on /api/oauth/*

    const payload = await unseal("state", state, await loadSealingKeys(KEYS_V1), StatePayload);
    expect(payload).toMatchObject({ p: "github", t: TARGETS, d: "web_message", o: "https://app.example.com", a: "demo", c: CHALLENGE });
    const nonceHash = base64urlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce))));
    expect(payload.n).toBe(nonceHash);
    expect(payload.x - Math.floor(Date.now() / 1000)).toBeGreaterThan(590);
  });

  it("parses the form body (charset parameter, add field, continue) and ignores the query string", async () => {
    const res = await postStart(
      "opencollective",
      { delivery: "paste", add: "1", continue: "targets=opencollective%3Asponsorkit&amount=500" },
      { contentType: "application/x-www-form-urlencoded; charset=UTF-8", query: `?targets=github:other&challenge=${"A".repeat(43)}&delivery=loopback` },
    );
    expect(res.status).toBe(302);
    const state = new URL(res.headers.get("Location")!).searchParams.get("state")!;
    const payload = await unseal("state", state, await loadSealingKeys(KEYS_V1), StatePayload);
    expect(payload).toMatchObject({ p: "opencollective", t: TARGETS, d: "paste", c: CHALLENGE, k: "targets=opencollective%3Asponsorkit&amount=500" });
  });

  it("accepts the site origin of a two-origin deployment and uses PUBLIC_ORIGIN for the callback URL", async () => {
    const env = makeEnv(SPLIT);
    const { location, res } = await start("opencollective", { delivery: "paste" }, env, "https://pages.test");
    expect(location.origin).toBe("https://oc.test");
    expect(location.searchParams.get("redirect_uri")).toBe("https://api.sponsorkit.test/api/oauth/opencollective/callback");
    // The nonce cookie is host-only (__Host-), so it lives on the API origin that set it.
    expect(res.headers.getSetCookie().find((c) => c.startsWith(NONCE_COOKIE))).not.toMatch(/Domain=/i);
  });

  it("defaults SITE_ORIGIN to the origin of SITE_BASE_URL", async () => {
    const env = makeEnv({ PUBLIC_ORIGIN: SPLIT.PUBLIC_ORIGIN, SITE_BASE_URL: SPLIT.SITE_BASE_URL });
    expect((await postStart("github", { delivery: "paste" }, { env, origin: "https://pages.test" })).status).toBe(302);
    expect((await postStart("github", { delivery: "paste" }, { env, origin: "https://api.sponsorkit.test" })).status).toBe(403);
  });

  it("single-origin self-hosting: with no site vars the API origin is the site origin", async () => {
    const env = makeEnv({ PUBLIC_ORIGIN: "https://self.example" });
    expect((await postStart("github", { delivery: "paste" }, { env, origin: "https://self.example" })).status).toBe(302);
    expect((await postStart("github", { delivery: "paste" }, { env, origin: ORIGIN })).status).toBe(403);
  });

  it("refuses a start whose Origin is missing, null or not exactly the site origin, linking to consent", async () => {
    const env = makeEnv(SPLIT);
    const params = { delivery: "redirect", redirect_uri: "https://evil.example/cb", app_name: "x", add: "1" };
    for (const origin of [
      null,
      "null",
      "https://evil.example",
      "https://api.sponsorkit.test",
      "http://pages.test",
      "https://pages.test:8443",
      "https://pages.test/",
      "https://PAGES.test",
      "https://sub.pages.test",
      "https://pages.test.evil.example",
    ]) {
      const res = await postStart("github", params, { env, origin });
      expect(res.status, String(origin)).toBe(403);
      expectNoSideEffects(res);
      const u = linkIn(await res.text());
      expect(u.origin + u.pathname).toBe(`${SPLIT_SITE}/connect/`);
      expect(Object.fromEntries(u.searchParams)).toEqual({ targets: TARGETS, challenge: CHALLENGE, ...params });
    }
  });

  it("refuses a framed start (Sec-Fetch-Dest other than document)", async () => {
    for (const dest of ["iframe", "frame", "embed", "object", "empty"]) {
      const res = await postStart("github", { delivery: "paste" }, { headers: { "Sec-Fetch-Dest": dest } });
      expect(res.status, dest).toBe(403);
      expectNoSideEffects(res);
    }
    expect((await postStart("github", { delivery: "paste" }, { headers: { "Sec-Fetch-Dest": "document", "Sec-Fetch-Site": "cross-site" } })).status).toBe(302);
  });

  it("links a refused /checkout start back to /checkout with its continue value plus the sign-in params", async () => {
    const res = await postStart(
      "opencollective",
      { delivery: "web_message", origin: "https://app.example.com", continue: "targets=opencollective%3Asponsorkit&amount=500" },
      { env: makeEnv(SPLIT), origin: "https://evil.example" },
    );
    expect(res.status).toBe(403);
    const u = linkIn(await res.text());
    expect(u.origin + u.pathname).toBe(`${SPLIT_SITE}/checkout/`);
    expect(u.searchParams.get("amount")).toBe("500");
    expect(u.searchParams.getAll("targets")).toEqual(["opencollective:sponsorkit"]);
    expect(u.searchParams.get("challenge")).toBe(CHALLENGE);
    expect(u.searchParams.get("origin")).toBe("https://app.example.com");
    expect(u.searchParams.has("continue")).toBe(false);
  });

  it("answers GET, HEAD and other methods with 405 + Allow: POST and a link to consent", async () => {
    const env = makeEnv(SPLIT);
    const q = `?${startForm({ delivery: "paste" })}`;
    for (const method of ["GET", "HEAD", "PUT", "DELETE"]) {
      const res = await call(`/api/oauth/github/start${q}`, { method, headers: { Origin: "https://pages.test" } }, env);
      expect(res.status, method).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
      expectNoSideEffects(res);
      if (method === "GET") {
        const u = linkIn(await res.text());
        expect(u.origin + u.pathname).toBe(`${SPLIT_SITE}/connect/`);
        expect(Object.fromEntries(u.searchParams)).toEqual({ targets: TARGETS, challenge: CHALLENGE, delivery: "paste" });
      }
    }
  });

  it("returns an HTML 400 for invalid params, content types and oversized bodies", async () => {
    const bodies: Array<[URLSearchParams | string, string?]> = [
      [startForm({ delivery: "redirect", redirect_uri: "http://evil.example.com/" })],
      [startForm({ delivery: "loopback", redirect_uri: "http://localhost:1234/callback" })],
      [startForm({ delivery: "web_message" })],
      [`targets=opencollective:x&challenge=${CHALLENGE}&delivery=paste`],
      [`targets=github:x&delivery=paste`],
      [""],
      [startForm({ delivery: "paste" }), "application/json"],
      [startForm({ delivery: "paste" }), "multipart/form-data; boundary=x"],
      [startForm({ delivery: "paste" }), "text/plain"],
      [`${startForm({ delivery: "paste" })}&app_name=${"a".repeat(9000)}`],
    ];
    for (const [body, contentType] of bodies) {
      // Validation runs before the Origin check: even a cross-site request gets the 400.
      for (const origin of [ORIGIN, "https://evil.example"]) {
        const res = await postStart("github", body, { contentType, origin });
        expect(res.status, `${String(body).slice(0, 80)} ${contentType}`).toBe(400);
        expectNoSideEffects(res);
      }
    }
    expect((await postStart("patreon", { delivery: "paste" })).status).toBe(404);
  });

  it("returns 500 HTML when misconfigured, without leaking the setting name", async () => {
    for (const over of [
      { ...SPLIT, SEALING_KEYS: undefined },
      { SITE_BASE_URL: "https://pages.test/sponsorkit.io", SITE_ORIGIN: "https://other.test" },
      { SITE_BASE_URL: "https://pages.test/sponsorkit.io", SITE_ORIGIN: "https://pages.test/sponsorkit.io" },
      { SITE_BASE_URL: "not a url" },
      { SITE_BASE_URL: "ftp://pages.test" },
    ] as Array<Partial<Env>>) {
      const env = makeEnv(over);
      const res = await postStart("github", { delivery: "paste" }, { env, origin: "https://pages.test" });
      expect(res.status, JSON.stringify(over)).toBe(500);
      expectNoSideEffects(res);
      const html = await res.text();
      expect(html).toContain("Sign-in unavailable");
      expect(html).not.toMatch(/SEALING_KEYS|SITE_ORIGIN|SITE_BASE_URL/);
    }
  });

  it("is rate limited per IP", async () => {
    const env = makeEnv({ RL_AUTH: fakeLimiter(1) });
    const req = () => postStart("github", { delivery: "paste" }, { headers: { "CF-Connecting-IP": "203.0.113.9" }, env });
    expect((await req()).status).toBe(302);
    const limited = await req();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
  });
});

describe("deliveries in a two-origin deployment", () => {
  beforeEach(() => {
    installFakeProviders();
  });
  const env = makeEnv(SPLIT);

  it("sends web_message and paste codes, and errors, to the site's /connect/done/", async () => {
    const wm = await start("github", { delivery: "web_message", origin: "https://app.example.com", continue: "targets=github%3Amathiaslorenzen" }, env, "https://pages.test");
    const res = await callback("github", { code: "good", state: wm.state }, wm.nonce, env);
    const loc = res.headers.get("Location")!;
    expect(loc.startsWith(`${SPLIT_SITE}/connect/done/#code=skc_`)).toBe(true);
    expect(new URLSearchParams(loc.split("#")[1]).get("continue")).toBe("targets=github%3Amathiaslorenzen");

    const p = await start("github", { delivery: "paste" }, env, "https://pages.test");
    const pres = await callback("github", { code: "good", state: p.state }, p.nonce, env);
    expect(pres.headers.get("Location")!.startsWith(`${SPLIT_SITE}/connect/done/#paste=skc_`)).toBe(true);

    const e = await start("github", { delivery: "web_message", origin: "https://app.example.com" }, env, "https://pages.test");
    const eres = await callback("github", { error: "access_denied", state: e.state }, e.nonce, env);
    expect(eres.headers.get("Location")).toBe(`${SPLIT_SITE}/connect/done/#error=access_denied&origin=https%3A%2F%2Fapp.example.com`);
  });

  it("uses the API origin for the provider callback URL in the code exchange", async () => {
    const fake = installFakeProviders();
    const { state, nonce } = await start("opencollective", { delivery: "paste" }, env, "https://pages.test");
    await callback("opencollective", { code: "good", state }, nonce, env);
    const exchange = fake.requests.find((r) => r.url.includes("token"))!;
    expect(new URLSearchParams(exchange.body).get("redirect_uri")).toBe("https://api.sponsorkit.test/api/oauth/opencollective/callback");
  });

  it("fails closed on the callback when the site config is invalid", async () => {
    const { state, nonce } = await start("github", { delivery: "paste" }, env, "https://pages.test");
    const res = await callback("github", { code: "good", state }, nonce, makeEnv({ ...SPLIT, SITE_ORIGIN: "https://other.test" }));
    expect(res.status).toBe(500);
    expect(res.headers.get("Location")).toBeNull();
  });
});

describe("GET /api/oauth/:provider/callback", () => {
  let fake: FakeProviders;
  beforeEach(() => {
    fake = installFakeProviders();
  });

  const cases: Array<{ delivery: string; extra: Record<string, string>; check: (loc: string) => string }> = [
    {
      delivery: "web_message",
      extra: { origin: "https://app.example.com", continue: "targets=github%3Amathiaslorenzen&amount=500" },
      check: (loc) => {
        expect(loc.startsWith(`${ORIGIN}/connect/done/#code=skc_`)).toBe(true);
        const h = new URLSearchParams(loc.split("#")[1]);
        expect(h.get("origin")).toBe("https://app.example.com");
        expect(h.get("continue")).toBe("targets=github%3Amathiaslorenzen&amount=500");
        return h.get("code")!;
      },
    },
    {
      delivery: "redirect",
      extra: { redirect_uri: "https://app.example.com/after?keep=1" },
      check: (loc) => {
        const u = new URL(loc);
        expect(u.origin + u.pathname).toBe("https://app.example.com/after");
        expect(u.searchParams.get("keep")).toBe("1");
        return u.searchParams.get("sponsorkit_code")!;
      },
    },
    {
      delivery: "loopback",
      extra: { redirect_uri: "http://127.0.0.1:53682/callback" },
      check: (loc) => {
        expect(loc).toMatch(/^http:\/\/127\.0\.0\.1:53682\/callback\?code=skc_/);
        return new URL(loc).searchParams.get("code")!;
      },
    },
    {
      delivery: "paste",
      extra: {},
      check: (loc) => {
        expect(loc.startsWith(`${ORIGIN}/connect/done/#paste=skc_`)).toBe(true);
        return new URLSearchParams(loc.split("#")[1]).get("paste")!;
      },
    },
  ];

  for (const tc of cases) {
    for (const provider of ["github", "opencollective"] as const) {
      it(`delivers a code via ${tc.delivery} (${provider})`, async () => {
        const { state, nonce } = await start(provider, { delivery: tc.delivery, ...tc.extra });
        const res = await callback(provider, { code: "good", state }, nonce);
        expect(res.status).toBe(302);
        expect(res.headers.getSetCookie().some((c) => c.startsWith(`${NONCE_COOKIE}=;`) && c.includes("Max-Age=0"))).toBe(true);
        const skc = tc.check(res.headers.get("Location")!);
        const code = await decodeCode(skc);
        expect(code.t).toBe(TARGETS);
        expect(code.c).toBe(CHALLENGE);
        expect(code.d).toBe(tc.delivery);
        const ttl = code.x - Math.floor(Date.now() / 1000);
        if (tc.delivery === "paste") expect(ttl).toBeGreaterThan(590);
        else expect(ttl).toBeLessThanOrEqual(60);
        if (provider === "github") {
          expect(code.i).toEqual({ p: "github", id: "583231", h: "alice", tok: "gho_good" });
        } else {
          expect(code.i).toMatchObject({ p: "opencollective", h: "bob", tok: "oc_good" });
          expect(code.i.tx).toBeGreaterThan(Date.now() / 1000 + 89 * 86400);
        }
        // The provider code exchange used the Worker's PKCE verifier and callback URL.
        const exchange = fake.requests.find((r) => r.url.includes("token"))!;
        const form = new URLSearchParams(exchange.body);
        expect(form.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(form.get("redirect_uri")).toBe(`${ORIGIN}/api/oauth/${provider}/callback`);
      });
    }
  }

  const errorCases: Array<[string, Record<string, string>, (loc: string) => void]> = [
    ["web_message", { origin: "https://app.example.com" }, (loc) => expect(loc).toBe(`${ORIGIN}/connect/done/#error=access_denied&origin=https%3A%2F%2Fapp.example.com`)],
    ["redirect", { redirect_uri: "https://app.example.com/after" }, (loc) => expect(loc).toBe("https://app.example.com/after?sponsorkit_error=access_denied")],
    ["loopback", { redirect_uri: "http://[::1]:4000/callback" }, (loc) => expect(loc).toBe("http://[::1]:4000/callback?error=access_denied")],
    ["paste", {}, (loc) => expect(loc).toBe(`${ORIGIN}/connect/done/#error=access_denied`)],
  ];
  for (const [delivery, extra, check] of errorCases) {
    it(`delivers access_denied via ${delivery}`, async () => {
      const { state, nonce } = await start("github", { delivery, ...extra });
      const res = await callback("github", { error: "access_denied", state }, nonce);
      expect(res.status).toBe(302);
      check(res.headers.get("Location")!);
    });
  }

  it("delivers provider_error when the code exchange fails", async () => {
    const { state, nonce } = await start("github", { delivery: "paste" });
    const res = await callback("github", { code: "bad", state }, nonce);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/connect/done/#error=provider_error`);
    const res2 = await callback("github", { state }, nonce);
    expect(res2.headers.get("Location")).toBe(`${ORIGIN}/connect/done/#error=provider_error`);
    const res3 = await callback("github", { error: "redirect_uri_mismatch", state }, nonce);
    expect(res3.headers.get("Location")).toBe(`${ORIGIN}/connect/done/#error=provider_error`);
  });

  it("delivers invalid_state when the state has expired", async () => {
    const keys = await loadSealingKeys(KEYS_V1);
    const nonce = base64urlEncode(new Uint8Array(32).fill(7));
    const n = base64urlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce))));
    const state = await seal(
      "state",
      { p: "github", t: TARGETS, d: "loopback", r: "http://127.0.0.1:9999/callback", c: CHALLENGE, n, v: "v".repeat(43), x: Math.floor(Date.now() / 1000) - 1 },
      keys,
    );
    const res = await callback("github", { code: "good", state }, nonce);
    expect(res.headers.get("Location")).toBe("http://127.0.0.1:9999/callback?error=invalid_state");
    expect(fake.requests).toHaveLength(0);
  });

  describe("with a real browser's cookie lifetime", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("still delivers invalid_state after the state expires (the cookie outlives it)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const { res, state, nonce } = await start("github", { delivery: "loopback", redirect_uri: "http://127.0.0.1:9999/callback" });
      const cookie = res.headers.getSetCookie().find((c) => c.startsWith(NONCE_COOKIE))!;
      const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)![1]);
      // The user comes back 11 minutes later: the state (600 s) has expired, the cookie hasn't.
      vi.setSystemTime(Date.now() + 660_000);
      expect(maxAge).toBeGreaterThan(660);
      const cb = await callback("github", { code: "good", state }, nonce);
      expect(cb.headers.get("Location")).toBe("http://127.0.0.1:9999/callback?error=invalid_state");
      expect(fake.requests).toHaveLength(0);
    });
  });

  it("shows an HTML error and delivers nothing when the nonce cookie is missing or wrong", async () => {
    const { state } = await start("github", { delivery: "loopback", redirect_uri: "http://127.0.0.1:53682/callback" });
    for (const nonce of [null, base64urlEncode(new Uint8Array(32)), "garbage"]) {
      const res = await callback("github", { code: "good", state }, nonce);
      expect(res.status).toBe(400);
      expect(res.headers.get("Location")).toBeNull();
      expect(res.headers.get("Content-Type")).toContain("text/html");
    }
    expect(fake.requests).toHaveLength(0);
  });

  it("shows an HTML error for tampered state or provider mismatch", async () => {
    const { state, nonce } = await start("github", { delivery: "paste" });
    expect((await callback("github", { code: "good", state: state.slice(0, -3) + "AAA" }, nonce)).status).toBe(400);
    expect((await callback("github", { code: "good" }, nonce)).status).toBe(400);
    expect((await callback("opencollective", { code: "good", state }, nonce)).status).toBe(400);
  });
});
