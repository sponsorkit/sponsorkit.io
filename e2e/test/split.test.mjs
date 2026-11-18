/**
 * Cross-origin end-to-end test of the split deployment (PROTOCOL §0, §4; SPEC D16, D17).
 *
 *   app (127.0.0.1)  ──SDK popup──▶  site /connect/ (127.0.0.2, static export, base path)
 *        ▲                              │ top-level form POST, Origin = site origin
 *        │                              ▼
 *        │                      API /api/oauth/github/start (localhost, wrangler dev)
 *        │                              │ 302 + __Host-sk_nonce on the API origin
 *        │                              ▼
 *        │                      fake provider authorize (127.0.0.3) ─▶ API callback
 *        │                              │ 302
 *        └──── postMessage ◀── site /connect/done/#code=…&origin=…
 *   SDK: POST /api/v1/auth/token, GET /api/v1/contributions (CORS) on the API.
 *
 * Run with `bun run --cwd e2e test` (builds the SDK and the site first).
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import { API_ORIGIN, APP_ORIGIN, BASE_PATH, CHROMIUM, FAKE_ORIGIN, MAINTAINER, SITE_BASE_URL, SITE_ORIGIN, SUPPORTER, TARGETS_PARAM } from "../lib/config.mjs";
import { startStack } from "../lib/stack.mjs";

// playwright is a devDependency of this package (e2e is a root workspace), resolved from
// e2e/node_modules or the root node_modules; never from a global NODE_PATH.
import { chromium } from "playwright";

const NONCE_COOKIE = "__Host-sk_nonce";
const START_URL = (p) => `${API_ORIGIN}/api/oauth/${p}/start`;
// A valid PKCE challenge (RFC 7636 appendix B).
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const STEP_TIMEOUT = 30_000;

let stack;
let browser;

before(async () => {
  stack = await startStack();
  browser = await chromium.launch({ headless: true, ...(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {}) });
});

after(async () => {
  await browser?.close().catch(() => {});
  await stack?.close();
});

beforeEach(() => stack.fake.reset());

// ---------- helpers ----------

/** A fresh browser profile with the external checkout destinations stubbed and requests recorded. */
async function newContext() {
  const context = await browser.newContext();
  const requests = [];
  context.on("request", (r) => requests.push(r));
  // Checkout redirects to the real github.com / opencollective.com; serve stand-ins instead.
  for (const host of ["https://github.com/**", "https://opencollective.com/**"]) {
    await context.route(host, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><title>Fake sponsor page</title><h1 id="sponsor-page">Sponsor page stand-in</h1><p>${route.request().url().replace(/</g, "&lt;")}</p>`,
      }),
    );
  }
  return { context, requests };
}

async function openApp(context) {
  const page = await context.newPage();
  await page.goto(`${APP_ORIGIN}/`);
  await page.waitForFunction(() => window.appReady === true, null, { timeout: STEP_TIMEOUT });
  return page;
}

/** Records every main-frame URL a page visits (redirect hops included). */
function trackNavigations(page) {
  const urls = [];
  page.on("framenavigated", (f) => f === page.mainFrame() && urls.push(f.url()));
  page.on("request", (r) => r.isNavigationRequest() && r.frame() === page.mainFrame() && urls.push(r.url()));
  return urls;
}

async function describePage(page) {
  try {
    if (page.isClosed()) return "(closed)";
    const text = (await page.locator("body").innerText({ timeout: 2000 }).catch(() => "")).slice(0, 1500);
    return `${page.url()}\n${text}`;
  } catch (e) {
    return `(unavailable: ${e.message})`;
  }
}

async function step(label, page, fn) {
  try {
    return await fn();
  } catch (e) {
    throw new Error(`${label}: ${String(e?.message ?? e).split("\n")[0]}\n--- page: ${await describePage(page)}`, { cause: e });
  }
}

/** Settles `window.results[name]` set by the app page's button handlers. */
async function appResult(page, name, timeout = 60_000) {
  let timer;
  return step(`waiting for the app's ${name}() result`, page, () =>
    Promise.race([
      page.evaluate((n) => window.results[n], name),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error(`timed out after ${timeout} ms`)), timeout);
      }),
    ]).finally(() => clearTimeout(timer)),
  );
}

async function nonceCookies(context) {
  return (await context.cookies(API_ORIGIN)).filter((c) => c.name === NONCE_COOKIE);
}

function startForm(extra = {}) {
  return { targets: TARGETS_PARAM, challenge: CHALLENGE, delivery: "web_message", origin: APP_ORIGIN, provider: "github", ...extra };
}

/** Submits a real top-level form POST from `frameOrPage`'s document (so the browser sets Origin). */
function submitForm(frameOrPage, action, fields) {
  return frameOrPage.evaluate(
    ({ action, fields }) => {
      const form = document.createElement("form");
      form.method = "post";
      form.action = action;
      form.enctype = "application/x-www-form-urlencoded";
      for (const [k, v] of Object.entries(fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = k;
        input.value = v;
        form.append(input);
      }
      document.body.append(form);
      form.submit();
    },
    { action, fields },
  );
}

/** Popup: consent page on the site → click the provider button → fake authorize page → Authorize. */
async function consentAndAuthorize(popup, { provider, label, requests }) {
  await step("consent page", popup, async () => {
    await popup.getByRole("button", { name: label }).waitFor({ timeout: STEP_TIMEOUT });
    assert.equal(await popup.getByTestId("requester").first().innerText(), APP_ORIGIN, "consent shows who is asking");
    const referrer = await popup.locator('meta[name="referrer"]').last().getAttribute("content");
    assert.equal(referrer, "strict-origin", "flow pages use referrer policy strict-origin (PROTOCOL §4.1)");
  });
  const before = requests.length;
  await step("submit consent", popup, async () => {
    await popup.getByRole("button", { name: label }).click();
    await popup.waitForURL((u) => u.href.startsWith(`${FAKE_ORIGIN}/${provider === "github" ? "gh" : "oc"}/`), { timeout: STEP_TIMEOUT });
  });
  // The start was a top-level form POST carrying the site's Origin.
  const start = requests.slice(before).find((r) => r.url().startsWith(START_URL(provider)));
  assert.ok(start, "a request to /api/oauth/:provider/start was made");
  assert.equal(start.method(), "POST", "sign-in starts with a POST");
  assert.ok(start.isNavigationRequest(), "the start is a top-level navigation");
  const headers = await start.allHeaders();
  assert.equal(headers.origin, SITE_ORIGIN, "Origin of the start is the site origin");
  assert.match(headers["content-type"] ?? "", /^application\/x-www-form-urlencoded/);
  if (headers["sec-fetch-dest"]) assert.equal(headers["sec-fetch-dest"], "document");
  assert.equal(new URL(start.url()).search, "", "start params are form fields, not a query string");
  const form = new URLSearchParams(start.postData() ?? "");
  assert.equal(form.get("targets"), TARGETS_PARAM);
  assert.equal(form.get("delivery"), "web_message");
  assert.equal(form.get("origin"), APP_ORIGIN);
  assert.match(form.get("challenge") ?? "", /^[A-Za-z0-9_-]{43}$/);
  const startResponse = await start.response();
  assert.equal(startResponse?.status(), 302);
  assert.equal((await nonceCookies(popup.context())).length, 1, "nonce cookie set on the API origin");
  await step("fake provider authorize", popup, () => popup.locator("#authorize").click());
  return form;
}

// ---------- tests ----------

describe("split deployment (site on its own origin, API-only Worker)", () => {
  test("sign-in: app → consent popup on the site → POST start → provider → callback → /connect/done/ → SDK exchange", async () => {
    stack.fake.addSponsorship({ provider: "github", cents: 500 });
    stack.fake.addSponsorship({ provider: "opencollective", cents: 1000, frequency: "YEARLY" });
    const { context, requests } = await newContext();
    try {
      const page = await openApp(context);

      // 1. GitHub sign-in through the popup.
      const [popup] = await Promise.all([context.waitForEvent("page"), page.click("#signin")]);
      const nav = trackNavigations(popup);
      await step("popup opens the consent page on the site", popup, () =>
        popup.waitForURL((u) => u.href.startsWith(`${SITE_BASE_URL}/connect/?`), { timeout: STEP_TIMEOUT }),
      );
      const q = new URL(popup.url()).searchParams;
      assert.equal(q.get("targets"), TARGETS_PARAM);
      assert.equal(q.get("delivery"), "web_message");
      assert.equal(q.get("origin"), APP_ORIGIN);
      assert.equal(q.get("provider"), "github");
      assert.match(q.get("challenge") ?? "", /^[A-Za-z0-9_-]{43}$/);

      await consentAndAuthorize(popup, { provider: "github", label: /Continue with GitHub/, requests });

      const result = await appResult(page, "signIn");
      assert.ok(result.ok, `signIn() resolved: ${JSON.stringify(result)}`);
      const done = nav.find((u) => u.startsWith(`${SITE_BASE_URL}/connect/done/`));
      assert.ok(done, `the callback delivered to the site's /connect/done/ (visited: ${nav.join(" → ")})`);
      assert.ok(nav.some((u) => u.startsWith(`${API_ORIGIN}/api/oauth/github/callback?`)), "the provider called back to the API origin");
      assert.equal((await nonceCookies(context)).length, 0, "the callback clears the nonce cookie");
      await popup.waitForEvent("close", { timeout: 5000 }).catch(() => {});
      assert.ok(popup.isClosed(), "the /connect/done/ popup closes itself");

      const r = result.value;
      assert.equal(r.signedIn, true);
      assert.equal(r.contributions.length, 1, JSON.stringify(r.contributions));
      assert.equal(r.contributions[0].provider, "github");
      assert.equal(r.contributions[0].target, `github:${MAINTAINER.github}`);
      assert.equal(r.contributions[0].status, "active");
      assert.deepEqual(r.contributions[0].amount, { value: 500, currency: "USD" });
      assert.equal(r.contributions[0].sponsor.handle, SUPPORTER.github.login);

      const log = stack.fake.log;
      assert.ok(log.some((e) => e.what === "token" && e.provider === "github" && e.ok), "provider code exchanged with a valid PKCE verifier");

      // 2. getFinancialContribution() against the API (CORS, bearer session).
      const fc = await page.evaluate(async () => (await window.sk.getFinancialContribution({ cacheTtl: 0 })).toJSON());
      assert.equal(fc.signedIn, true);
      assert.equal(fc.fromCache, false, "fresh result from GET /api/v1/contributions");
      assert.deepEqual(
        fc.contributions.map((c) => [c.provider, c.status, c.amount.value]),
        [["github", "active", 500]],
      );

      // 3. Add the Open Collective identity (add=1) through a second popup.
      const [popup2] = await Promise.all([context.waitForEvent("page"), page.click("#signin-oc")]);
      await step("second popup opens /connect/ with add=1", popup2, () =>
        popup2.waitForURL((u) => u.href.startsWith(`${SITE_BASE_URL}/connect/?`) && u.searchParams.get("add") === "1", { timeout: STEP_TIMEOUT }),
      );
      await consentAndAuthorize(popup2, { provider: "opencollective", label: /Continue with Open Collective/, requests });
      const result2 = await appResult(page, "signInOc");
      assert.ok(result2.ok, `signIn({ provider: "opencollective" }) resolved: ${JSON.stringify(result2)}`);
      const byProvider = Object.fromEntries(result2.value.contributions.map((c) => [c.provider, c]));
      assert.deepEqual(Object.keys(byProvider).sort(), ["github", "opencollective"]);
      assert.equal(byProvider.opencollective.frequency, "yearly");
      assert.deepEqual(byProvider.opencollective.amount, { value: 1000, currency: "USD" });
    } finally {
      await context.close();
    }
  });

  test("protocol without the SDK: window.open(/connect/) → POST start → callback → /connect/done/ posts from the site origin → /auth/token", async () => {
    // Isolates the site + API from the SDK: the app page plays the SDK's part by hand (PROTOCOL §4, §3.2).
    stack.fake.addSponsorship({ provider: "github", cents: 2500 });
    const { context, requests } = await newContext();
    try {
      const page = await openApp(context);
      const connectUrl = await page.evaluate(async ({ site, targets }) => {
        const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
        const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
        const q = new URLSearchParams({ targets, challenge, delivery: "web_message", origin: location.origin, provider: "github" });
        const url = `${site}/connect/?${q}`;
        window.rawFlow = { verifier, url, messages: [] };
        window.rawFlow.message = new Promise((resolve) => {
          window.addEventListener("message", (e) => {
            window.rawFlow.messages.push({ origin: e.origin, data: e.data });
            if (e.data && (e.data.type === "sponsorkit:code" || e.data.type === "sponsorkit:error")) resolve({ origin: e.origin, data: e.data });
          });
        });
        return url;
      }, { site: SITE_BASE_URL, targets: TARGETS_PARAM });
      const [popup] = await Promise.all([
        context.waitForEvent("page"),
        page.evaluate((u) => {
          window.rawFlow.popup = window.open(u, "sponsorkit", "popup,width=520,height=720");
        }, connectUrl),
      ]);
      await step("consent page loads", popup, () => popup.waitForURL((u) => u.href.startsWith(`${SITE_BASE_URL}/connect/?`), { timeout: STEP_TIMEOUT }));
      await consentAndAuthorize(popup, { provider: "github", label: /Continue with GitHub/, requests });
      const msg = await step("message from /connect/done/", page, () => page.evaluate(() => window.rawFlow.message));
      assert.equal(msg.origin, SITE_ORIGIN, "the code is posted from the site origin (PROTOCOL §4.5)");
      assert.equal(msg.data.type, "sponsorkit:code", JSON.stringify(msg.data));
      assert.match(msg.data.code, /^skc_/);
      const token = await page.evaluate(
        async ({ api, code }) => {
          const r = await fetch(`${api}/api/v1/auth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, codeVerifier: window.rawFlow.verifier }),
          });
          return { status: r.status, body: await r.json() };
        },
        { api: API_ORIGIN, code: msg.data.code },
      );
      assert.equal(token.status, 200, JSON.stringify(token.body));
      assert.match(token.body.sessionToken, /^sks_/);
      assert.deepEqual(
        token.body.result.contributions.map((c) => [c.provider, c.status, c.amount.value]),
        [["github", "active", 2500]],
      );
    } finally {
      await context.close();
    }
  });

  test("checkout: sign-in inside /checkout/ continues to the provider's sponsor page and the SDK sees the new sponsorship", async () => {
    const { context, requests } = await newContext();
    try {
      const page = await openApp(context);
      const [popup] = await Promise.all([context.waitForEvent("page"), page.click("#checkout")]);
      const nav = trackNavigations(popup);
      await step("popup opens /checkout/ on the site", popup, () =>
        popup.waitForURL((u) => u.href.startsWith(`${SITE_BASE_URL}/checkout/?`), { timeout: STEP_TIMEOUT }),
      );
      const q = new URL(popup.url()).searchParams;
      assert.equal(q.get("provider"), "github");
      assert.equal(q.get("amount"), "500");
      assert.equal(q.get("frequency"), "monthly");
      assert.ok(q.get("challenge"), "checkout asks for a sign-in first");

      const form = await consentAndAuthorize(popup, { provider: "github", label: /Continue with GitHub/, requests });
      const cont = new URLSearchParams(form.get("continue") ?? "");
      assert.equal(cont.get("targets"), TARGETS_PARAM, "continue carries the checkout query");
      assert.equal(cont.get("amount"), "500");
      assert.equal(cont.has("challenge"), false, "continue has no sign-in params");

      await step("redirect to the provider's sponsor page", popup, () =>
        popup.waitForURL((u) => u.href.startsWith("https://github.com/sponsors/"), { timeout: STEP_TIMEOUT }),
      );
      assert.equal(popup.url(), `https://github.com/sponsors/${MAINTAINER.github}/sponsorships?tier_id=501`, "cheapest monthly tier ≥ $5");
      const choose = nav.find((u) => u.startsWith(`${SITE_BASE_URL}/checkout/?`) && new URL(u).searchParams.get("step") === "choose");
      assert.ok(choose, `/connect/done/ continued to /checkout/?…&step=choose on the site (visited: ${nav.join(" → ")})`);
      assert.ok(nav.some((u) => u.startsWith(`${SITE_BASE_URL}/connect/done/`)), "delivered via the site's /connect/done/");

      // The supporter sponsors at the provider, then closes the window; the SDK's polling sees it.
      stack.fake.addSponsorship({ provider: "github", cents: 500 });
      await popup.close();
      const result = await appResult(page, "checkout");
      assert.ok(result.ok, `openCheckout() resolved: ${JSON.stringify(result)}`);
      assert.equal(result.value.status, "contributed", JSON.stringify(result.value));
      assert.equal(result.value.contribution.provider, "github");
      assert.deepEqual(result.value.contribution.amount, { value: 500, currency: "USD" });
    } finally {
      await context.close();
    }
  });

  test("checkoutUrl(): anonymous /checkout/ on the site redirects to Open Collective with redirect=<site>/checkout/thanks/", async () => {
    const { context } = await newContext();
    try {
      const page = await openApp(context);
      const url = await page.evaluate(() => window.sk.checkoutUrl({ provider: "opencollective", amount: 1000, frequency: "monthly" }));
      assert.ok(url.startsWith(`${SITE_BASE_URL}/checkout/?`), `checkoutUrl() is on the site: ${url}`);
      await page.goto(url);
      await step("redirect to Open Collective", page, () =>
        page.waitForURL((u) => u.href.startsWith("https://opencollective.com/"), { timeout: STEP_TIMEOUT }),
      );
      const oc = new URL(page.url());
      assert.equal(oc.pathname, `/${MAINTAINER.opencollective}/donate`);
      assert.equal(oc.searchParams.get("amount"), "10");
      assert.equal(oc.searchParams.get("interval"), "month");
      assert.equal(oc.searchParams.get("redirect"), `${SITE_BASE_URL}/checkout/thanks/`);
      const thanks = await page.goto(oc.searchParams.get("redirect"));
      assert.equal(thanks?.status(), 200, "the thanks page exists on the site");
    } finally {
      await context.close();
    }
  });

  test("a start that did not come from the consent page is rejected: cross-site POST → 403, GET link → 405, framed → 403; no cookie", async () => {
    const { context } = await newContext();
    try {
      const page = await openApp(context);

      // Cross-site form POST from the app's own origin (Origin = app origin).
      const [res403] = await Promise.all([
        page.waitForResponse((r) => r.url() === START_URL("github") && r.request().method() === "POST", { timeout: STEP_TIMEOUT }),
        submitForm(page, START_URL("github"), startForm()),
      ]);
      assert.equal(res403.status(), 403);
      assert.equal(res403.headers()["set-cookie"], undefined, "no cookie on a rejected start");
      assert.equal(res403.headers().location, undefined, "no redirect on a rejected start");
      assert.equal((await res403.request().allHeaders()).origin, APP_ORIGIN);
      await page.waitForLoadState("domcontentloaded");
      const consentLink = await page.locator(`a[href^="${SITE_BASE_URL}/connect/?"]`).first().getAttribute("href");
      assert.ok(consentLink, "the 403 page links to the consent page on the site");
      const lq = new URL(consentLink).searchParams;
      assert.equal(lq.get("targets"), TARGETS_PARAM);
      assert.equal(lq.get("origin"), APP_ORIGIN);
      assert.equal(lq.get("challenge"), CHALLENGE);

      // Script-driven cross-site POST (fetch, no-cors): opaque, but must not plant a cookie either.
      await page.goto(`${APP_ORIGIN}/`);
      await page.evaluate(
        ({ url, body }) => fetch(url, { method: "POST", mode: "no-cors", body: new URLSearchParams(body) }).catch(() => null),
        { url: START_URL("github"), body: startForm() },
      );

      // A plain GET link (old-style start URL) → 405 with Allow: POST and a link to consent.
      const getUrl = `${START_URL("github")}?${new URLSearchParams(startForm())}`;
      const res405 = await page.goto(getUrl);
      assert.equal(res405?.status(), 405);
      assert.equal(res405?.headers().allow, "POST");
      assert.equal(res405?.headers()["set-cookie"], undefined);
      assert.ok(await page.locator(`a[href^="${SITE_BASE_URL}/connect/?"]`).count(), "the 405 page links to the consent page");

      // The consent page framed by the app: no provider buttons; a script-submitted start from the
      // frame has the right Origin but Sec-Fetch-Dest: iframe → 403.
      await page.goto(`${APP_ORIGIN}/`);
      await page.evaluate((src) => {
        const f = document.createElement("iframe");
        f.src = src;
        f.id = "framed";
        f.style.width = "600px";
        f.style.height = "600px";
        document.body.append(f);
      }, `${SITE_BASE_URL}/connect/?${new URLSearchParams(startForm())}`);
      const frame = await step("framed consent page loads", page, async () => {
        await page.waitForFunction(() => document.getElementById("framed")?.contentWindow, null, { timeout: STEP_TIMEOUT });
        const handle = await page.$("#framed");
        const f = await handle.contentFrame();
        await f.waitForSelector('[data-testid="framed"]', { timeout: STEP_TIMEOUT });
        return f;
      });
      assert.equal(await frame.getByRole("button", { name: /Continue with/ }).count(), 0, "no provider buttons when framed");
      const [resFramed] = await Promise.all([
        page.waitForResponse((r) => r.url() === START_URL("github") && r.request().method() === "POST", { timeout: STEP_TIMEOUT }),
        submitForm(frame, START_URL("github"), startForm()),
      ]);
      const framedHeaders = await resFramed.request().allHeaders();
      assert.equal(framedHeaders.origin, SITE_ORIGIN, "the framed submit carries the site origin");
      // Chromium sends Sec-Fetch-Dest: iframe here (Playwright doesn't always report it for subframes).
      if (framedHeaders["sec-fetch-dest"]) assert.equal(framedHeaders["sec-fetch-dest"], "iframe");
      assert.equal(resFramed.status(), 403, "a framed start is rejected (Sec-Fetch-Dest)");
      assert.equal(resFramed.headers()["set-cookie"], undefined);

      assert.equal((await nonceCookies(context)).length, 0, "no nonce cookie was ever set");
      assert.equal(
        stack.fake.log.filter((e) => e.what === "authorize").length,
        0,
        "the provider was never reached",
      );
    } finally {
      await context.close();
    }
  });

  test("API is API-only: problem+json 404 off /api, CORS only on /api/v1, problem type on the site", async () => {
    const root = await fetch(`${API_ORIGIN}/`);
    assert.equal(root.status, 404);
    assert.match(root.headers.get("content-type") ?? "", /application\/problem\+json/);
    const problem = await root.json();
    assert.equal(problem.code, "not_found");
    assert.equal(problem.type, `${SITE_BASE_URL}/docs/reference-http/http-api/#errors`);

    for (const p of ["/connect/", "/checkout/", "/connect/done/"]) {
      const r = await fetch(`${API_ORIGIN}${p}`);
      assert.equal(r.status, 404, `the API serves no page at ${p}`);
    }

    const targets = await fetch(`${API_ORIGIN}/api/v1/targets?github=${MAINTAINER.github}`, { headers: { Origin: SITE_ORIGIN } });
    assert.equal(targets.status, 200);
    assert.equal(targets.headers.get("access-control-allow-origin"), "*");
    assert.equal(targets.headers.get("access-control-allow-credentials"), null);

    const start = await fetch(START_URL("github"), { method: "OPTIONS", headers: { Origin: APP_ORIGIN, "Access-Control-Request-Method": "POST" } });
    assert.equal(start.headers.get("access-control-allow-origin"), null, "no CORS on /api/oauth/*");

    // A server-side POST with a forged Origin is accepted by design (only browsers are protected),
    // which also proves the exact-match rule: one character off is rejected.
    const off = await fetch(START_URL("github"), {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: `${SITE_ORIGIN}/` },
      body: new URLSearchParams(startForm()),
    });
    assert.equal(off.status, 403, "Origin must equal SITE_ORIGIN byte for byte");
    assert.equal(off.headers.get("set-cookie"), null);
  });

  test("site pages are served from the site origin under the base path with trailing slashes", async () => {
    for (const p of ["/", "/connect/", "/connect/done/", "/checkout/", "/checkout/thanks/"]) {
      const r = await fetch(`${SITE_BASE_URL}${p}`);
      assert.equal(r.status, 200, `${SITE_BASE_URL}${p}`);
    }
    const html = await (await fetch(`${SITE_BASE_URL}/connect/`)).text();
    assert.ok(html.includes(`${BASE_PATH}/_next/`), "assets are referenced under the base path");
  });
});
