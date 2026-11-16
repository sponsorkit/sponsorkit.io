import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { base64urlEncode } from "../src/encoding";
import { CodePayload, StatePayload } from "../src/payloads";
import { NONCE_COOKIE } from "../src/routes/oauth";
import { loadSealingKeys, seal, unseal } from "../src/seal";
import { CHALLENGE, KEYS_V1, ORIGIN, call, fakeLimiter, getCookie, installFakeProviders, makeEnv, type FakeProviders } from "./helpers";

const TARGETS = "github:mathiaslorenzen,opencollective:sponsorkit";

function startPath(provider: string, params: Record<string, string>): string {
  return `/api/oauth/${provider}/start?${new URLSearchParams({ targets: TARGETS, challenge: CHALLENGE, ...params })}`;
}

async function start(provider: string, params: Record<string, string>) {
  const res = await call(startPath(provider, params));
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("Location")!);
  const nonce = getCookie(res, NONCE_COOKIE)!;
  return { res, location, nonce, state: location.searchParams.get("state")! };
}

async function callback(provider: string, query: Record<string, string>, nonce: string | null) {
  const headers: Record<string, string> = {};
  if (nonce !== null) headers.Cookie = `other=1; ${NONCE_COOKIE}=${nonce}`;
  return call(`/api/oauth/${provider}/callback?${new URLSearchParams(query)}`, { headers });
}

async function decodeCode(skc: string) {
  return unseal("code", skc, await loadSealingKeys(KEYS_V1), CodePayload);
}

describe("GET /api/oauth/:provider/start", () => {
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

    const payload = await unseal("state", state, await loadSealingKeys(KEYS_V1), StatePayload);
    expect(payload).toMatchObject({ p: "github", t: TARGETS, d: "web_message", o: "https://app.example.com", a: "demo", c: CHALLENGE });
    const nonceHash = base64urlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce))));
    expect(payload.n).toBe(nonceHash);
    expect(payload.x - Math.floor(Date.now() / 1000)).toBeGreaterThan(590);
  });

  it("uses PUBLIC_ORIGIN for the callback URL when set", async () => {
    const res = await call(startPath("opencollective", { delivery: "paste" }), {}, makeEnv({ PUBLIC_ORIGIN: "https://sponsorkit.io/" }));
    const location = new URL(res.headers.get("Location")!);
    expect(location.origin).toBe("https://oc.test");
    expect(location.searchParams.get("redirect_uri")).toBe("https://sponsorkit.io/api/oauth/opencollective/callback");
  });

  it("returns an HTML 400 for invalid params", async () => {
    for (const path of [
      startPath("github", { delivery: "redirect", redirect_uri: "http://evil.example.com/" }),
      startPath("github", { delivery: "loopback", redirect_uri: "http://localhost:1234/callback" }),
      startPath("github", { delivery: "web_message" }),
      `/api/oauth/github/start?targets=opencollective:x&challenge=${CHALLENGE}&delivery=paste`,
      `/api/oauth/github/start?targets=github:x&delivery=paste`,
    ]) {
      const res = await call(path);
      expect(res.status, path).toBe(400);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      expect(res.headers.get("Set-Cookie")).toBeNull();
    }
    expect((await call(`/api/oauth/patreon/start?targets=github:x`)).status).toBe(404);
  });

  it("returns 500 HTML when misconfigured", async () => {
    const res = await call(startPath("github", { delivery: "paste" }), {}, makeEnv({ SEALING_KEYS: undefined }));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("SEALING_KEYS");
  });

  it("accepts navigations from Sponsorkit's own consent pages", async () => {
    for (const site of ["same-origin", "same-site"]) {
      const res = await call(startPath("github", { delivery: "paste" }), { headers: { "Sec-Fetch-Site": site, "Sec-Fetch-User": "?1" } });
      expect(res.status, site).toBe(302);
    }
  });

  it("refuses cross-site or direct links that skip the consent screen, linking to it instead", async () => {
    const params = { delivery: "redirect", redirect_uri: "https://evil.example/cb", app_name: "x" };
    for (const site of ["cross-site", "none"]) {
      const res = await call(startPath("github", params), { headers: { "Sec-Fetch-Site": site } });
      expect(res.status, site).toBe(403);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      expect(res.headers.get("Location")).toBeNull();
      expect(res.headers.get("Set-Cookie")).toBeNull();
      const html = await res.text();
      const href = /<a href="([^"]+)"/.exec(html)![1]!.replaceAll("&amp;", "&");
      const u = new URL(href);
      expect(u.origin + u.pathname).toBe(`${ORIGIN}/connect`);
      expect(Object.fromEntries(u.searchParams)).toEqual({ targets: TARGETS, challenge: CHALLENGE, ...params });
    }
    // A /checkout flow goes back to /checkout with its continue value plus the sign-in params.
    const res = await call(startPath("opencollective", { delivery: "web_message", origin: "https://app.example.com", continue: "targets=opencollective%3Asponsorkit&amount=500" }), {
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    const href = /<a href="([^"]+)"/.exec(await res.text())![1]!.replaceAll("&amp;", "&");
    const u = new URL(href);
    expect(u.pathname).toBe("/checkout");
    expect(u.searchParams.get("amount")).toBe("500");
    expect(u.searchParams.get("targets")).toBe("opencollective:sponsorkit");
    expect(u.searchParams.get("challenge")).toBe(CHALLENGE);
    expect(u.searchParams.get("origin")).toBe("https://app.example.com");
  });

  it("is rate limited per IP", async () => {
    const env = makeEnv({ RL_AUTH: fakeLimiter(1) });
    const req = () => call(startPath("github", { delivery: "paste" }), { headers: { "CF-Connecting-IP": "203.0.113.9" } }, env);
    expect((await req()).status).toBe(302);
    const limited = await req();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
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
        expect(loc.startsWith(`${ORIGIN}/connect/done#code=skc_`)).toBe(true);
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
        expect(loc.startsWith(`${ORIGIN}/connect/done#paste=skc_`)).toBe(true);
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
    ["web_message", { origin: "https://app.example.com" }, (loc) => expect(loc).toBe(`${ORIGIN}/connect/done#error=access_denied&origin=https%3A%2F%2Fapp.example.com`)],
    ["redirect", { redirect_uri: "https://app.example.com/after" }, (loc) => expect(loc).toBe("https://app.example.com/after?sponsorkit_error=access_denied")],
    ["loopback", { redirect_uri: "http://[::1]:4000/callback" }, (loc) => expect(loc).toBe("http://[::1]:4000/callback?error=access_denied")],
    ["paste", {}, (loc) => expect(loc).toBe(`${ORIGIN}/connect/done#error=access_denied`)],
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
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/connect/done#error=provider_error`);
    const res2 = await callback("github", { state }, nonce);
    expect(res2.headers.get("Location")).toBe(`${ORIGIN}/connect/done#error=provider_error`);
    const res3 = await callback("github", { error: "redirect_uri_mismatch", state }, nonce);
    expect(res3.headers.get("Location")).toBe(`${ORIGIN}/connect/done#error=provider_error`);
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
