import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fullResult from "@sponsorkit/conformance/fixtures/contribution-result.json";
import { browserCommand, defaultStorageDir, fileStorage, resetProcessState, Sponsorkit, SponsorkitError } from "../../src/node/index";
import { startLoopbackReceiver } from "../../src/node/loopback";
import { verifySession } from "../../src/server";

const dirs: string[] = [];
async function tempDir() {
  const d = await mkdtemp(join(tmpdir(), "sponsorkit-unit-"));
  dirs.push(d);
  return join(d, "store");
}
afterEach(async () => {
  resetProcessState();
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json", ...(init.headers as object) } });

/** A tiny fake API: records calls, answers via `routes`. */
function fakeFetch(routes: Record<string, (req: { url: URL; init?: RequestInit }) => Response | Promise<Response>>) {
  const calls: { method: string; path: string; body?: unknown; auth?: string }[] = [];
  const fn = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const headers = new Headers(init?.headers);
    calls.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get("authorization") ?? undefined,
    });
    const route = routes[`${init?.method ?? "GET"} ${url.pathname}`];
    if (!route) throw new TypeError("fetch failed");
    return route({ url, init });
  };
  return { fn, calls };
}

const tokenOk = () => json({ sessionToken: "sks_new", expiresAt: "2030-01-01T00:00:00Z", result: fullResult });

describe("configuration", () => {
  test("invalid options throw invalid_config", () => {
    const bad = [
      {},
      { github: "-bad" },
      { github: "ok", appName: "x".repeat(65) },
      { github: "ok", apiBaseUrl: "notaurl" },
      { github: "ok", signInMethod: "carrier-pigeon" as never },
      { github: "ok", checkoutPollInterval: 0 },
      { github: "ok", cacheTtl: -1 },
    ];
    for (const opts of bad) {
      expect(() => new Sponsorkit({ env: {}, ...opts })).toThrow(SponsorkitError);
    }
  });

  test("checkoutUrl validates options and needs no network", () => {
    const sk = new Sponsorkit({ github: "OctoCat", env: {} });
    expect(sk.checkoutUrl({ amount: 500, currency: "usd", frequency: "monthly" })).toBe(
      "https://sponsorkit.io/checkout?targets=github%3Aoctocat&amount=500&currency=USD&frequency=monthly",
    );
    expect(() => sk.checkoutUrl({ provider: "opencollective" })).toThrow(/No opencollective target/);
    expect(() => sk.checkoutUrl({ amount: 1.5 })).toThrow(SponsorkitError);
    expect(() => sk.checkoutUrl({ frequency: "weekly" as never })).toThrow(SponsorkitError);
    for (const bad of [{ amount: 0 }, { amount: -500 }, { currency: "EURO" }, { provider: "patreon" as never }]) {
      expect(() => sk.checkoutUrl(bad)).toThrow(expect.objectContaining({ code: "invalid_config" }));
    }
  });

  test("devChecks default follows SPONSORKIT_DEV_CHECKS in the env override", async () => {
    const calls: string[] = [];
    const fetch = async (url: string) => {
      calls.push(new URL(url).pathname);
      return json({ targets: [{ target: "github:octocat", exists: false }] });
    };
    const on = new Sponsorkit({ github: "octocat", env: { SPONSORKIT_DEV_CHECKS: "1" }, storageDir: await tempDir(), fetch });
    await expect(on.getFinancialContribution()).rejects.toMatchObject({ code: "invalid_config" });
    resetProcessState();
    for (const opts of [{ env: {} }, { env: { SPONSORKIT_DEV_CHECKS: "false" } }, { env: { SPONSORKIT_DEV_CHECKS: "1" }, devChecks: false }]) {
      const off = new Sponsorkit({ github: "octocat", storageDir: await tempDir(), fetch, ...opts });
      expect((await off.getFinancialContribution()).signedIn).toBe(false);
    }
    expect(calls).toEqual(["/api/v1/targets"]);
  });

  test("the env override replaces the process environment", async () => {
    const saved = process.env.SPONSORKIT_DISABLE;
    process.env.SPONSORKIT_DISABLE = "1";
    try {
      expect(new Sponsorkit({ github: "octocat", env: {} }).disabled).toBe(false);
      expect(new Sponsorkit({ github: "octocat" }).disabled).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.SPONSORKIT_DISABLE;
      else process.env.SPONSORKIT_DISABLE = saved;
    }
  });

  test("default storage directory per platform", () => {
    expect(defaultStorageDir({ XDG_CONFIG_HOME: "/x/cfg" }, "linux")).toBe("/x/cfg/sponsorkit");
    expect(defaultStorageDir({}, "linux")).toMatch(/\.config\/sponsorkit$/);
    expect(defaultStorageDir({}, "darwin")).toMatch(/Library\/Application Support\/sponsorkit$/);
    expect(defaultStorageDir({ APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "win32")).toContain("sponsorkit");
  });

  test("browser opener never uses a shell", () => {
    const evil = "https://example.com/?a=1&calc.exe|x";
    expect(browserCommand(evil, "win32")).toEqual({ command: "rundll32", args: ["url.dll,FileProtocolHandler", evil] });
    expect(browserCommand(evil, "linux")).toEqual({ command: "xdg-open", args: [evil] });
    expect(browserCommand(evil, "darwin")).toEqual({ command: "open", args: [evil] });
  });
});

describe("sign-in", () => {
  test("auto falls back to paste-back when the browser can't be opened", async () => {
    const { fn, calls } = fakeFetch({ "POST /api/v1/auth/token": tokenOk });
    const prompts: string[] = [];
    let opened = 0;
    const saved = { DISPLAY: process.env.DISPLAY, SSH_CONNECTION: process.env.SSH_CONNECTION, SSH_TTY: process.env.SSH_TTY };
    process.env.DISPLAY = ":0";
    delete process.env.SSH_CONNECTION;
    delete process.env.SSH_TTY;
    const sk = new Sponsorkit({
      github: "sponsorkit-conformance",
      opencollective: "sponsorkit-conformance",
      appName: "unit",
      storageDir: await tempDir(),
      env: {},
      fetch: fn,
      signInMethod: "auto",
      output: { write() {} },
      openBrowser: () => {
        opened++;
        throw new Error("no browser");
      },
      promptForCode: (url) => {
        prompts.push(url);
        return "  skc_abc\n";
      },
    });
    let fc: Awaited<ReturnType<typeof sk.signIn>>;
    try {
      fc = await sk.signIn();
    } finally {
      for (const [k, v] of Object.entries(saved))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    expect(fc.signedIn).toBe(true);
    expect(opened).toBe(1);
    expect(prompts).toHaveLength(1);
    const url = new URL(prompts[0]!);
    expect(url.searchParams.get("delivery")).toBe("paste");
    expect(url.searchParams.get("app_name")).toBe("unit");
    expect(calls.at(-1)?.body).toMatchObject({ code: "skc_abc" });
    expect(await sk.isSignedIn()).toBe(true);
  });

  test("a stale stored session is replaced when adding an identity fails with session_invalid", async () => {
    let n = 0;
    const { fn, calls } = fakeFetch({
      "POST /api/v1/auth/token": ({ init }) =>
        JSON.parse(String(init?.body)).sessionToken && n++ === 0
          ? json({ type: "about:blank", title: "x", status: 401, code: "session_invalid" }, { status: 401 })
          : tokenOk(),
    });
    const dir = await tempDir();
    const opts = {
      github: "octocat",
      storageDir: dir,
      env: {},
      fetch: fn,
      signInMethod: "paste" as const,
      output: { write() {} },
      promptForCode: () => "skc_1",
    };
    await fileStorage(dir).write("0309e87b72e9ebbb324075c26f58478bf2aca6c8cbc26bae3bb2bc74080640f9", JSON.stringify({ v: 1, sessionToken: "sks_old" }));
    await new Sponsorkit(opts).signIn();
    expect(calls.map((c) => (c.body as { sessionToken?: string }).sessionToken)).toEqual(["sks_old", undefined]);
    const stored = JSON.parse(await readFile(join(dir, "0309e87b72e9ebbb324075c26f58478bf2aca6c8cbc26bae3bb2bc74080640f9.json"), "utf8"));
    expect(stored.sessionToken).toBe("sks_new");
  });

  test("invalid codes reject with invalid_code", async () => {
    const { fn } = fakeFetch({
      "POST /api/v1/auth/token": () => json({ type: "about:blank", title: "x", status: 400, code: "invalid_code" }, { status: 400 }),
    });
    const sk = new Sponsorkit({
      github: "octocat",
      storageDir: await tempDir(),
      env: {},
      fetch: fn,
      signInMethod: "paste",
      output: { write() {} },
      promptForCode: () => "skc_bad",
    });
    await expect(sk.signIn()).rejects.toMatchObject({ code: "invalid_code" });
    expect(await sk.isSignedIn()).toBe(false);
  });

  test("loopback sign-in can be cancelled", async () => {
    const ac = new AbortController();
    const sk = new Sponsorkit({
      github: "octocat",
      storageDir: await tempDir(),
      env: {},
      signInMethod: "loopback",
      output: { write() {} },
      openBrowser: () => {},
    });
    setTimeout(() => ac.abort(), 50);
    await expect(sk.signIn({ signal: ac.signal })).rejects.toMatchObject({ code: "cancelled" });
  });

  test("sign-in that exceeds signInTimeout rejects with timeout (loopback and paste)", async () => {
    const base = { github: "octocat", storageDir: await tempDir(), env: {}, output: { write() {} }, signInTimeout: 0.05 };
    const loopback = new Sponsorkit({ ...base, signInMethod: "loopback", openBrowser: () => {} });
    await expect(loopback.signIn()).rejects.toMatchObject({ code: "timeout" });
    const paste = new Sponsorkit({ ...base, signInMethod: "paste", promptForCode: () => new Promise<string>(() => {}) });
    await expect(paste.signIn()).rejects.toMatchObject({ code: "timeout" });
    expect(await paste.isSignedIn()).toBe(false);
    expect(() => new Sponsorkit({ ...base, signInTimeout: 0 })).toThrow(SponsorkitError);
  });

  test("an empty paste-back code rejects with cancelled", async () => {
    const sk = new Sponsorkit({
      github: "octocat",
      storageDir: await tempDir(),
      env: {},
      signInMethod: "paste",
      output: { write() {} },
      promptForCode: () => " ",
    });
    await expect(sk.signIn()).rejects.toMatchObject({ code: "cancelled" });
  });

  test("an unreachable or failing /auth/token rejects with network_error", async () => {
    const base = { github: "octocat", env: {}, signInMethod: "paste" as const, output: { write() {} }, promptForCode: () => "skc_1" };
    const offline = fakeFetch({});
    await expect(new Sponsorkit({ ...base, storageDir: await tempDir(), fetch: offline.fn }).signIn()).rejects.toMatchObject({
      code: "network_error",
      retryAfter: undefined,
    });
    const limited = fakeFetch({ "POST /api/v1/auth/token": () => new Response("", { status: 429, headers: { "retry-after": "12" } }) });
    await expect(new Sponsorkit({ ...base, storageDir: await tempDir(), fetch: limited.fn }).signIn()).rejects.toMatchObject({
      code: "network_error",
      retryAfter: 12,
    });
    const down = fakeFetch({ "POST /api/v1/auth/token": () => new Response("", { status: 503 }) });
    const sk = new Sponsorkit({ ...base, storageDir: await tempDir(), fetch: down.fn });
    await expect(sk.signIn()).rejects.toMatchObject({ code: "network_error" });
    expect(await sk.isSignedIn()).toBe(false);
    const garbage = fakeFetch({ "POST /api/v1/auth/token": () => json({ nope: true }) });
    await expect(new Sponsorkit({ ...base, storageDir: await tempDir(), fetch: garbage.fn }).signIn()).rejects.toMatchObject({ code: "network_error" });
  });

  test("signIn rejects an unconfigured provider", async () => {
    const sk = new Sponsorkit({ github: "octocat", env: {}, storageDir: await tempDir() });
    await expect(sk.signIn({ provider: "opencollective" })).rejects.toMatchObject({ code: "invalid_config" });
  });
});

describe("loopback receiver", () => {
  test("delivers the code once and ignores other paths", async () => {
    const r = await startLoopbackReceiver();
    expect(r.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect((await fetch(r.redirectUri.replace("/callback", "/other"))).status).toBe(404);
    const res = await fetch(`${r.redirectUri}?code=skc_x`);
    expect(await res.text()).toContain("You can close this window");
    expect(await r.result).toEqual({ code: "skc_x" });
    expect((await fetch(`${r.redirectUri}?code=skc_y`)).status).toBe(404);
    await r.close();
  });

  test("redirects onward during checkout and reports errors", async () => {
    const r = await startLoopbackReceiver("https://sponsorkit.io/checkout?targets=github%3Ax&step=choose");
    const res = await fetch(`${r.redirectUri}?code=skc_x`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://sponsorkit.io/checkout?targets=github%3Ax&step=choose");
    await r.close();
    const e = await startLoopbackReceiver();
    await fetch(`${e.redirectUri}?error=%3Cscript%3E`)
      .then((x) => x.text())
      .then((t) => expect(t).not.toContain("<script>"));
    expect(await e.result).toEqual({ error: "<script>" });
    await e.close();
  });
});

describe("checkout", () => {
  test("timeout covers only the polling phase; sign-in uses signInTimeout", async () => {
    const { fn, calls } = fakeFetch({
      "POST /api/v1/auth/token": tokenOk,
      "GET /api/v1/contributions": () => json(fullResult),
    });
    const sk = new Sponsorkit({
      github: "sponsorkit-conformance",
      opencollective: "sponsorkit-conformance",
      storageDir: await tempDir(),
      env: {},
      fetch: fn,
      signInMethod: "paste",
      output: { write() {} },
      promptForCode: () => new Promise((r) => setTimeout(() => r("skc_1"), 150)),
    });
    expect(await sk.openCheckout({ timeout: 0.1, pollInterval: 0.02 })).toEqual({ status: "unknown" });
    expect(calls.filter((c) => c.path === "/api/v1/contributions").length).toBeGreaterThan(1);
  });

  test("cancelling during the sign-in phase resolves unknown; a sign-in timeout throws timeout", async () => {
    const base = {
      github: "octocat",
      env: {},
      signInMethod: "paste" as const,
      output: { write() {} },
      promptForCode: () => new Promise<string>(() => {}),
    };
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 30);
    expect(await new Sponsorkit({ ...base, storageDir: await tempDir() }).openCheckout({ signal: ac.signal })).toEqual({ status: "unknown" });
    await expect(new Sponsorkit({ ...base, storageDir: await tempDir(), signInTimeout: 0.05 }).openCheckout()).rejects.toMatchObject({
      code: "timeout",
    });
  });
});

describe("cache and clock", () => {
  test("cacheTtl uses the injected clock and never goes below 60 s", async () => {
    let now = Date.parse("2026-06-01T00:00:00Z");
    const { fn, calls } = fakeFetch({
      "POST /api/v1/auth/token": tokenOk,
      "GET /api/v1/contributions": () => json(fullResult),
    });
    const sk = new Sponsorkit({
      github: "sponsorkit-conformance",
      opencollective: "sponsorkit-conformance",
      storageDir: await tempDir(),
      env: {},
      fetch: fn,
      cacheTtl: 1,
      clock: () => now,
      signInMethod: "paste",
      output: { write() {} },
      promptForCode: () => "skc_1",
    });
    await sk.signIn();
    now += 59_000;
    expect((await sk.getFinancialContribution()).fromCache).toBe(true);
    now += 2_000;
    expect((await sk.getFinancialContribution()).fromCache).toBe(false);
    expect(calls.filter((c) => c.path === "/api/v1/contributions")).toHaveLength(1);
  });

  test("storage files are 0600 in a 0700 directory, with no temp files", async () => {
    const dir = await tempDir();
    const s = fileStorage(dir);
    await Promise.all(Array.from({ length: 10 }, (_, i) => s.write("abc", JSON.stringify({ v: 1, i }))));
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, "abc.json"))).mode & 0o777).toBe(0o600);
    expect(await readdir(dir)).toEqual(["abc.json"]);
  });
});

describe("nag", () => {
  test("interactive override, no predicate, and invalid options", async () => {
    const sk = new Sponsorkit({ github: "octocat", env: {}, storageDir: await tempDir(), interactive: true });
    expect(await sk.nag({ id: "n", every: 1 }).due()).toBe(true);
    expect(await new Sponsorkit({ github: "octocat", env: {}, storageDir: await tempDir(), interactive: false }).nag({ id: "n", every: 1 }).due()).toBe(false);
    expect(() => sk.nag({ id: "", every: 1 })).toThrow(SponsorkitError);
    expect(() => sk.nag({ id: "x", every: 1, orEvery: "soon" })).toThrow(SponsorkitError);
  });
});

describe("verifySession", () => {
  test("accepts target params in any form and reports outages as network_error", async () => {
    const ok = fakeFetch({ "GET /api/v1/contributions": () => json(fullResult) });
    const fc = await verifySession("sks_t", "opencollective:sponsorkit-conformance,github:sponsorkit-conformance", { fetch: ok.fn });
    expect(fc.active().length).toBeGreaterThan(0);
    expect(ok.calls[0]?.auth).toBe("Bearer sks_t");
    await expect(verifySession("sks_t", { github: "other" }, { fetch: ok.fn })).rejects.toMatchObject({ code: "targets_mismatch" });
    await expect(verifySession("", { github: "x" }, { fetch: ok.fn })).rejects.toMatchObject({ code: "session_invalid" });
    await expect(verifySession("sks_t", { github: "-x" }, { fetch: ok.fn })).rejects.toMatchObject({ code: "invalid_config" });
    const down = fakeFetch({ "GET /api/v1/contributions": () => new Response("", { status: 503 }) });
    await expect(verifySession("sks_t", { github: "x" }, { fetch: down.fn })).rejects.toMatchObject({ code: "network_error", retryAfter: undefined });
    const limited = fakeFetch({ "GET /api/v1/contributions": () => new Response("", { status: 429, headers: { "retry-after": "30" } }) });
    await expect(verifySession("sks_t", { github: "x" }, { fetch: limited.fn })).rejects.toMatchObject({ code: "network_error", retryAfter: 30 });
    const limitedNoHeader = fakeFetch({ "GET /api/v1/contributions": () => new Response("", { status: 429 }) });
    await expect(verifySession("sks_t", { github: "x" }, { fetch: limitedNoHeader.fn })).rejects.toMatchObject({
      code: "network_error",
      retryAfter: undefined,
    });
    const offline = fakeFetch({});
    await expect(verifySession("sks_t", { github: "x" }, { fetch: offline.fn })).rejects.toMatchObject({ code: "network_error" });
  });
});
