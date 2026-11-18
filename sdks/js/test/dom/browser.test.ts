/** Browser entry: popup sign-in via postMessage, redirect fallback, checkout, localStorage (happy-dom). */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import fullResult from "@sponsorkit/conformance/fixtures/contribution-result.json";
import contributions from "@sponsorkit/conformance/fixtures/contributions.json";

beforeAll(() => GlobalRegistrator.register({ url: "https://app.example/page" }));
afterAll(() => GlobalRegistrator.unregister());

const sdk = () => import("../../src/index");
/** Default site base URL (pages) and its origin (postMessage); the API is a different origin. */
const SITE = "https://sponsorkit.github.io/sponsorkit.io";
const SITE_ORIGIN = "https://sponsorkit.github.io";
const API = "https://api.sponsorkit.io";
const HASH = "3363d36356e472dab64ce744efd4e8bad412dd7f152bfd357ba96aa97180ac0e";

class FakePopup {
  closed = false;
  location = { href: "about:blank" };
  close() {
    this.closed = true;
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function setup(over: Record<string, unknown> = {}) {
  const popups: FakePopup[] = [];
  const calls: { origin: string; path: string; body?: unknown }[] = [];
  let contributionsBody: unknown = fullResult;
  const fetch = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ origin: url.origin, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.pathname === "/api/v1/auth/token") return json({ sessionToken: "sks_browser", expiresAt: "2030-01-01T00:00:00Z", result: fullResult });
    if (url.pathname === "/api/v1/contributions") return json(contributionsBody);
    return new Response("nope", { status: 404 });
  };
  return {
    popups,
    calls,
    setContributions: (b: unknown) => {
      contributionsBody = b;
    },
    options: {
      github: "sponsorkit-conformance",
      opencollective: "sponsorkit-conformance",
      env: {},
      fetch,
      openWindow: () => {
        const p = new FakePopup();
        popups.push(p);
        return p as unknown as Window;
      },
      ...over,
    },
  };
}

function post(source: unknown, data: unknown, origin = SITE_ORIGIN) {
  window.dispatchEvent(new MessageEvent("message", { origin, source: source as Window, data }));
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("popup sign-in (delivery=web_message)", () => {
  test("opens synchronously, validates origin and source, stores the session in localStorage", async () => {
    const { Sponsorkit, resetProcessState } = await sdk();
    resetProcessState();
    const env = setup();
    const sk = new Sponsorkit(env.options);
    const pending = sk.signIn({ provider: "github" });
    expect(env.popups).toHaveLength(1); // opened before any await
    const popup = env.popups[0]!;
    await tick(10);
    const url = new URL(popup.location.href);
    expect(url.origin + url.pathname).toBe(`${SITE}/connect/`);
    expect(url.searchParams.get("delivery")).toBe("web_message");
    expect(url.searchParams.get("origin")).toBe("https://app.example");
    expect(url.searchParams.get("targets")).toBe("github:sponsorkit-conformance,opencollective:sponsorkit-conformance");
    expect(url.searchParams.get("provider")).toBe("github");
    expect(url.searchParams.get("challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.has("app_name")).toBe(false);
    expect(url.searchParams.has("redirect_uri")).toBe(false);

    post(popup, { type: "sponsorkit:code", code: "skc_evil" }, "https://evil.example"); // wrong origin
    post(popup, { type: "sponsorkit:code", code: "skc_evil" }, API); // the API origin never posts messages
    post(new FakePopup(), { type: "sponsorkit:code", code: "skc_evil" }); // wrong source
    post(popup, { type: "sponsorkit:code", code: "skc_good" });
    const fc = await pending;
    expect(fc.signedIn).toBe(true);
    expect(env.calls.filter((c) => c.path === "/api/v1/auth/token").map((c) => (c.body as { code: string }).code)).toEqual(["skc_good"]);
    expect(new Set(env.calls.map((c) => c.origin))).toEqual(new Set([API]));
    const stored = JSON.parse(localStorage.getItem(`sponsorkit:${HASH}`) ?? "null");
    expect(stored).toMatchObject({ v: 1, sessionToken: "sks_browser", cache: { result: { signedIn: true } } });
    expect(await sk.isSignedIn()).toBe(true);
    expect(await sk.getSessionToken()).toBe("sks_browser");
    expect((await sk.getFinancialContribution()).fromCache).toBe(true);
  });

  test("siteBaseUrl and apiBaseUrl: pages and message origin on the site, API calls on the API", async () => {
    const { Sponsorkit } = await sdk();
    const env = setup({ apiBaseUrl: "https://api.self.example/", siteBaseUrl: "https://pages.self.example/kit//" });
    const sk = new Sponsorkit(env.options);
    expect(sk.apiBaseUrl).toBe("https://api.self.example");
    expect(sk.siteBaseUrl).toBe("https://pages.self.example/kit");
    const pending = sk.signIn();
    await tick(10);
    const popup = env.popups[0]!;
    const url = new URL(popup.location.href);
    expect(url.origin + url.pathname).toBe("https://pages.self.example/kit/connect/");
    post(popup, { type: "sponsorkit:code", code: "skc_evil" }, "https://api.self.example"); // API origin: ignored
    post(popup, { type: "sponsorkit:code", code: "skc_evil" }, SITE_ORIGIN); // default site origin: ignored
    post(popup, { type: "sponsorkit:code", code: "skc_good" }, "https://pages.self.example");
    await pending;
    expect(env.calls.map((c) => `${c.origin}${c.path}`)).toEqual(["https://api.self.example/api/v1/auth/token"]);
    expect(env.calls[0]?.body).toMatchObject({ code: "skc_good" });
  });

  test("apiBaseUrl alone: the site defaults to it (single origin)", async () => {
    const { Sponsorkit } = await sdk();
    const sk = new Sponsorkit({ github: "octocat", env: {}, apiBaseUrl: "http://127.0.0.1:8787", siteBaseUrl: "" });
    expect(sk.siteBaseUrl).toBe("http://127.0.0.1:8787");
    expect(sk.checkoutUrl()).toBe("http://127.0.0.1:8787/checkout/?targets=github%3Aoctocat");
    expect(() => new Sponsorkit({ github: "octocat", env: {}, siteBaseUrl: "ftp://x.example" })).toThrow(/siteBaseUrl/);
    expect(() => new Sponsorkit({ github: "octocat", env: {}, siteBaseUrl: "https://x.example/?q=1" })).toThrow(/siteBaseUrl/);
  });

  test("an error message rejects with its code", async () => {
    const { Sponsorkit } = await sdk();
    const env = setup();
    const pending = new Sponsorkit(env.options).signIn();
    await tick(10);
    post(env.popups[0], { type: "sponsorkit:error", error: "access_denied" });
    await expect(pending).rejects.toMatchObject({ code: "access_denied" });
  });

  test("closing the popup rejects with cancelled", async () => {
    const { Sponsorkit } = await sdk();
    const env = setup();
    const pending = new Sponsorkit(env.options).signIn();
    await tick(10);
    env.popups[0]!.closed = true;
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  });

  test("aborting the signal rejects with cancelled; signInTimeout rejects with timeout", async () => {
    const { Sponsorkit } = await sdk();
    const env = setup();
    const ac = new AbortController();
    const pending = new Sponsorkit(env.options).signIn({ signal: ac.signal });
    await tick(10);
    ac.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    await expect(new Sponsorkit({ ...env.options, signInTimeout: 0.05 }).signIn()).rejects.toMatchObject({ code: "timeout" });
  });

  test("a blocked popup rejects with popup_blocked", async () => {
    const { Sponsorkit } = await sdk();
    const env = setup({ openWindow: () => null });
    await expect(new Sponsorkit(env.options).signIn()).rejects.toMatchObject({ code: "popup_blocked" });
    await expect(new Sponsorkit(env.options).openCheckout()).rejects.toMatchObject({ code: "popup_blocked" });
  });

  test("disabled rejects without opening anything", async () => {
    const { Sponsorkit } = await sdk();
    const env = setup({ env: { SPONSORKIT_DISABLE: "1" } });
    await expect(new Sponsorkit(env.options).signIn()).rejects.toMatchObject({ code: "disabled" });
    expect(env.popups).toHaveLength(0);
  });
});

describe("redirect fallback (returnTo)", () => {
  test("completes the sign-in from sponsorkit_code on return and cleans the URL", async () => {
    const { Sponsorkit } = await sdk();
    const env = setup({ openWindow: () => null, returnTo: "https://app.example/page" });
    const sk = new Sponsorkit(env.options);
    // Simulate the state signIn() leaves behind before navigating away, then the return trip.
    sessionStorage.setItem(`sponsorkit:pending:${HASH}`, JSON.stringify({ verifier: "v".repeat(43), returnTo: "https://app.example/page" }));
    (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL("https://app.example/page?x=1&sponsorkit_code=skc_redirect");
    const fc = await sk.getFinancialContribution();
    expect(fc.signedIn).toBe(true);
    expect(env.calls.find((c) => c.path === "/api/v1/auth/token")?.body).toMatchObject({ code: "skc_redirect", codeVerifier: "v".repeat(43) });
    expect(location.href).toBe("https://app.example/page?x=1");
    expect(sessionStorage.getItem(`sponsorkit:pending:${HASH}`)).toBeNull();
  });

  test("a blocked popup navigates to /connect/ with delivery=redirect and remembers the verifier", async () => {
    const { Sponsorkit } = await sdk();
    const env = setup({ openWindow: () => null, returnTo: "https://app.example/page" });
    const assigned: string[] = [];
    const original = Object.getOwnPropertyDescriptor(window.location, "assign");
    Object.defineProperty(window.location, "assign", { configurable: true, value: (u: string) => assigned.push(u) });
    try {
      void new Sponsorkit(env.options).signIn();
      await tick(20);
    } finally {
      if (original) Object.defineProperty(window.location, "assign", original);
      else delete (window.location as unknown as Record<string, unknown>).assign;
    }
    expect(assigned).toHaveLength(1);
    const url = new URL(assigned[0]!);
    expect(url.origin + url.pathname).toBe(`${SITE}/connect/`);
    expect(url.searchParams.get("delivery")).toBe("redirect");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/page");
    const pending = JSON.parse(sessionStorage.getItem(`sponsorkit:pending:${HASH}`) ?? "null");
    expect(pending.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("an unexpected sponsorkit_code without a pending sign-in is ignored", async () => {
    const { Sponsorkit } = await sdk();
    const env = setup();
    (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL("https://app.example/page?sponsorkit_code=skc_forged");
    expect(await new Sponsorkit(env.options).handleRedirectCallback()).toBe(false);
    expect(env.calls).toHaveLength(0);
  });

  test("rejects invalid returnTo", async () => {
    const { Sponsorkit } = await sdk();
    expect(() => new Sponsorkit({ github: "x", env: {}, returnTo: "http://evil.example/" })).toThrow(/returnTo/);
  });
});

describe("checkout", () => {
  test("signed in: popup goes to /checkout/ without challenge; polls after it closes", async () => {
    const { Sponsorkit } = await sdk();
    const env = setup({ checkoutPollInterval: 0.05 });
    localStorage.setItem(
      `sponsorkit:${HASH}`,
      JSON.stringify({ v: 1, sessionToken: "sks_x", cache: { result: fullResult, storedAt: new Date().toISOString() } }),
    );
    const sk = new Sponsorkit(env.options);
    const pending = sk.openCheckout({ provider: "github", amount: 1000, frequency: "monthly", timeout: 5 });
    expect(env.popups).toHaveLength(1);
    await tick(20);
    const url = new URL(env.popups[0]!.location.href);
    expect(url.origin + url.pathname).toBe(`${SITE}/checkout/`);
    expect(url.searchParams.has("challenge")).toBe(false);
    expect(url.searchParams.get("amount")).toBe("1000");
    await tick(100);
    expect(env.calls.filter((c) => c.path === "/api/v1/contributions")).toHaveLength(0); // waits for the popup to close
    const added = contributions.contributions["github-checkout-new"];
    env.setContributions({ ...fullResult, contributions: [...fullResult.contributions, added] });
    env.popups[0]!.closed = true;
    const r = await pending;
    expect(r).toEqual({ status: "contributed", contribution: added as never });
  });

  test("signed out: one popup signs in via /checkout/ and continues", async () => {
    const { Sponsorkit } = await sdk();
    const env = setup({ checkoutPollInterval: 0.05 });
    const ac = new AbortController();
    const pending = new Sponsorkit(env.options).openCheckout({ frequency: "monthly", signal: ac.signal });
    await tick(20);
    const url = new URL(env.popups[0]!.location.href);
    expect(url.origin + url.pathname).toBe(`${SITE}/checkout/`);
    expect(url.searchParams.get("challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("delivery")).toBe("web_message");
    post(env.popups[0], { type: "sponsorkit:code", code: "skc_checkout" });
    await tick(50);
    expect(env.popups[0]!.closed).toBe(false); // the popup continues to the provider
    ac.abort();
    expect(await pending).toEqual({ status: "unknown" });
  });

  test("checkoutUrl is synchronous", async () => {
    const { Sponsorkit } = await sdk();
    expect(new Sponsorkit({ github: "octocat", env: {} }).checkoutUrl({ frequency: "one_time" })).toBe(
      `${SITE}/checkout/?targets=github%3Aoctocat&frequency=one_time`,
    );
  });
});
