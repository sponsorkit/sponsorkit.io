/** Regression tests for PROTOCOL §7.0 "Robustness rules (all SDKs)". */
import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fullResult from "@sponsorkit/conformance/fixtures/contribution-result.json";
import { MAX_RETRY_AFTER, retryAfterSeconds } from "../../src/http";
import { fileStorage, memoryStorage, openSystemBrowser, resetProcessState, Sponsorkit, SponsorkitError } from "../../src/node/index";
import { verifySession } from "../../src/server";
import { parseStorageFile } from "../../src/storage";
import type { ContributionResult } from "../../src/types";
import { parseIsoTimestamp } from "../../src/util";

const dirs: string[] = [];
async function tempRoot() {
  const d = await mkdtemp(join(tmpdir(), "sponsorkit-robust-"));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  resetProcessState();
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json", ...(init.headers as object) } });
const tokenOk = (token = "sks_new") => json({ sessionToken: token, expiresAt: "2030-01-01T00:00:00Z", result: fullResult });
const TARGETS = { github: "sponsorkit-conformance", opencollective: "sponsorkit-conformance" };
const quiet = { output: { write() {} }, env: {} };

/** A paste-back client on a private in-memory map, with `fetch` routed by `"METHOD /path"`. */
function client(
  routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>,
  extra: Partial<ConstructorParameters<typeof Sponsorkit>[0]> = {},
) {
  const map = new Map<string, string>();
  const fetch = async (input: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? "GET"} ${new URL(input).pathname}`];
    if (!route) throw new TypeError("fetch failed");
    return route(init);
  };
  const sk = new Sponsorkit({
    ...TARGETS,
    ...quiet,
    storage: memoryStorage(map),
    fetch,
    signInMethod: "paste",
    promptForCode: () => "skc_1",
    ...extra,
  });
  const doc = () => JSON.parse([...map.values()][0] ?? "null");
  const setDoc = (v: unknown) => map.set([...map.keys()][0] as string, JSON.stringify(v));
  return { sk, map, doc, setDoc };
}

describe("Retry-After (PROTOCOL §7.0)", () => {
  test("non-finite or malformed values are ignored; others are clamped to 24 h", () => {
    const now = Date.parse("2026-11-16T00:00:00Z");
    expect(MAX_RETRY_AFTER).toBe(86_400);
    expect(retryAfterSeconds("120", now)).toBe(120);
    expect(retryAfterSeconds("86401", now)).toBe(86_400);
    expect(retryAfterSeconds("9".repeat(400), now)).toBe(86_400); // Number() would give Infinity
    for (const bad of ["Infinity", "-Infinity", "NaN", "1e999", "1e3", "-5", "1.5", "soon", ""]) {
      expect(retryAfterSeconds(bad, now)).toBeUndefined();
    }
    expect(retryAfterSeconds("Wed, 21 Oct 2015 07:28:00 GMT", now)).toBe(0);
    expect(retryAfterSeconds("Fri, 31 Dec 9999 23:59:59 GMT", now)).toBe(86_400);
  });

  test("a huge Retry-After neither crashes nor overflows the refresh memo or error", async () => {
    let now = Date.parse("2026-06-01T00:00:00Z");
    let limited = false;
    const calls: string[] = [];
    const { sk } = client(
      {
        "POST /api/v1/auth/token": () => tokenOk(),
        "GET /api/v1/contributions": () => {
          calls.push("get");
          return limited ? new Response("", { status: 429, headers: { "retry-after": "9".repeat(400) } }) : json(fullResult);
        },
      },
      { clock: () => now },
    );
    await sk.signIn();
    limited = true;
    expect((await sk.getFinancialContribution({ cacheTtl: 0 })).stale).toBe(true);
    now += 86_399_000;
    expect((await sk.getFinancialContribution({ cacheTtl: 0 })).stale).toBe(true);
    expect(calls).toHaveLength(1);
    now += 2_000; // past the 24 h clamp: the SDK asks again
    limited = false;
    expect((await sk.getFinancialContribution({ cacheTtl: 0 })).stale).toBe(false);
    expect(calls).toHaveLength(2);

    const fetch = async () => new Response("", { status: 429, headers: { "retry-after": "9".repeat(400) } });
    await expect(verifySession("sks_t", { github: "x" }, { fetch })).rejects.toMatchObject({ code: "network_error", retryAfter: 86_400 });
  });
});

describe("unexpected /auth/token responses (PROTOCOL §7.0)", () => {
  test("a 400 with any code other than invalid_code is a network_error", async () => {
    for (const body of [
      json({ type: "about:blank", title: "x", status: 400, code: "invalid_request" }, { status: 400 }),
      new Response("not json", { status: 400 }),
    ]) {
      const { sk } = client({ "POST /api/v1/auth/token": () => body });
      await expect(sk.signIn()).rejects.toMatchObject({ code: "network_error" });
      expect(await sk.isSignedIn()).toBe(false);
    }
  });

  test("a session token that isn't sks_ + printable ASCII is a malformed response", async () => {
    const { sk } = client({ "POST /api/v1/auth/token": () => tokenOk("sks_a b") });
    await expect(sk.signIn()).rejects.toMatchObject({ code: "network_error" });
  });
});

describe("timestamps (PROTOCOL §7.0)", () => {
  test("ISO-8601 with a fractional part of any length", () => {
    const base = Date.parse("2026-11-16T18:00:00Z");
    expect(parseIsoTimestamp("2026-11-16T18:00:00Z")).toBe(base);
    expect(parseIsoTimestamp("2026-11-16T18:00:00.5Z")).toBe(base + 500);
    expect(parseIsoTimestamp("2026-11-16T18:00:00.123Z")).toBe(base + 123);
    expect(parseIsoTimestamp("2026-11-16T18:00:00.123456Z")).toBe(base + 123);
    expect(parseIsoTimestamp("2026-11-16T18:00:00.123456789123Z")).toBe(base + 123);
    expect(parseIsoTimestamp("2026-11-16T19:00:00.000001+01:00")).toBe(base);
    for (const bad of ["1", "2026", "2026-11-16", "2026-02-30T00:00:00Z", "2026-11-16T24:00:00Z", "2026-11-16T18:00:00.Z", "yesterday", 5, null]) {
      expect(parseIsoTimestamp(bad)).toBeNull();
    }
  });

  test("a cache written with nanosecond precision is still fresh, and nag lastShown is honoured", async () => {
    const now = Date.parse("2026-06-01T00:10:00Z");
    const calls: string[] = [];
    const { sk, setDoc } = client(
      {
        "POST /api/v1/auth/token": () => tokenOk(),
        "GET /api/v1/contributions": () => {
          calls.push("get");
          return json(fullResult);
        },
      },
      { clock: () => now, interactive: true },
    );
    await sk.signIn();
    setDoc({
      v: 1,
      sessionToken: "sks_new",
      cache: { result: fullResult, storedAt: "2026-06-01T00:00:00.123456789Z" },
      nags: { n: { runs: 0, lastShown: "2026-05-01T00:00:00.000000001Z" } },
    });
    expect((await sk.getFinancialContribution()).fromCache).toBe(true);
    expect(calls).toHaveLength(0);
    expect(await sk.nag({ id: "n", every: 100, orEvery: "P7D" }).due()).toBe(true);
  });
});

describe("storage reads never throw (PROTOCOL §7.0)", () => {
  const cache = { result: fullResult as unknown as ContributionResult, storedAt: "2026-06-01T00:00:00Z" };
  test.each([
    ["not JSON", "{"],
    ["a JSON array", "[]"],
    ["a JSON null", "null"],
    ["another version", JSON.stringify({ v: 2, sessionToken: "sks_x" })],
  ])("an unparseable document (%s) counts as absent", (_, raw) => {
    expect(parseStorageFile(raw)).toEqual({ v: 1 });
  });

  test("non-string storage values count as absent", () => {
    for (const raw of [42, {}, [], undefined, null, true]) expect(parseStorageFile(raw)).toEqual({ v: 1 });
  });

  test.each([
    ["no prefix", "abc"],
    ["empty after prefix", "sks_"],
    ["a space", "sks_a b"],
    ["a control character", "sks_a\u0001"],
    ["non-ASCII", "sks_é"],
    ["a replacement character (bad UTF-8)", "sks_�"],
    ["a number", 42],
  ])("a token with %s is absent; other parts are kept", (_, token) => {
    expect(parseStorageFile(JSON.stringify({ v: 1, sessionToken: token, cache }))).toEqual({ v: 1, cache });
  });

  const bad = (over: Record<string, unknown>) => ({ ...fullResult, ...over });
  test.each([
    ["result is null", { result: null, storedAt: cache.storedAt }],
    ["result is a string", { result: "x", storedAt: cache.storedAt }],
    ["contributions is null", { result: bad({ contributions: null }), storedAt: cache.storedAt }],
    ["a contribution is null", { result: bad({ contributions: [null] }), storedAt: cache.storedAt }],
    ["a contribution is a string", { result: bad({ contributions: ["x"] }), storedAt: cache.storedAt }],
    ["a contribution lacks an id", { result: bad({ contributions: [{ ...fullResult.contributions[0], id: 7 }] }), storedAt: cache.storedAt }],
    ["targets is null", { result: bad({ targets: null }), storedAt: cache.storedAt }],
    ["signedIn is a string", { result: bad({ signedIn: "yes" }), storedAt: cache.storedAt }],
    ["supporter is a list", { result: bad({ supporter: [] }), storedAt: cache.storedAt }],
    ["unavailable is null", { result: bad({ unavailable: null }), storedAt: cache.storedAt }],
    ["storedAt is not ISO", { result: fullResult, storedAt: "1" }],
    ["storedAt is a number", { result: fullResult, storedAt: 1 }],
  ])("a cache where %s is absent; the token is kept", (_, badCache) => {
    expect(parseStorageFile(JSON.stringify({ v: 1, sessionToken: "sks_ok", cache: badCache }))).toEqual({ v: 1, sessionToken: "sks_ok" });
  });

  test("malformed nag entries are dropped and bad dates become null", () => {
    expect(parseStorageFile(JSON.stringify({ v: 1, nags: null }))).toEqual({ v: 1 });
    expect(parseStorageFile(JSON.stringify({ v: 1, nags: [] }))).toEqual({ v: 1 });
    expect(
      parseStorageFile(
        JSON.stringify({
          v: 1,
          nags: { a: null, b: "x", c: { runs: "3" }, d: { runs: -1 }, e: { runs: 1.5 }, f: { runs: 2, lastShown: "Tuesday" }, g: { runs: 1, lastShown: 5 } },
        }),
      ),
    ).toEqual({ v: 1, nags: { f: { runs: 2, lastShown: null }, g: { runs: 1, lastShown: null } } });
  });

  test("a storage file with invalid UTF-8 counts as absent", async () => {
    const dir = join(await tempRoot(), "store");
    const sk = new Sponsorkit({ ...TARGETS, ...quiet, storageDir: dir });
    // Create our document by counting a nag run, then corrupt it.
    await sk.nag({ id: "n", every: 1 }).due();
    const [file] = await readdir(dir);
    const valid = Buffer.from(JSON.stringify({ v: 1, sessionToken: "sks_x" }));
    await writeFile(join(dir, file as string), Buffer.concat([valid.subarray(0, 20), Buffer.from([0xff, 0xfe]), valid.subarray(20)]));
    expect(fileStorage(dir).read((file as string).replace(/\.json$/, ""))).toBeNull();
    expect(await sk.isSignedIn()).toBe(false);
    expect((await sk.getFinancialContribution()).signedIn).toBe(false);
  });

  test("a storage whose read throws counts as absent everywhere", async () => {
    const storage = {
      read(): string {
        throw new Error("EIO");
      },
      write() {},
    };
    const sk = new Sponsorkit({ ...TARGETS, ...quiet, storage, interactive: true });
    expect(await sk.isSignedIn()).toBe(false);
    expect(await sk.getSessionToken()).toBeNull();
    expect((await sk.getFinancialContribution()).signedIn).toBe(false);
    expect(await sk.nag({ id: "n", every: 0 }).due()).toBe(true);
    await sk.signOut();
  });
});

describe("storage write failures (PROTOCOL §7.0)", () => {
  test("failing to persist the session in signIn, or to clear it in signOut, throws invalid_config", async () => {
    let failWrites = true;
    const map = new Map<string, string>();
    const storage = {
      read: (h: string) => map.get(h) ?? null,
      write(h: string, v: string) {
        if (failWrites) throw Object.assign(new Error("EROFS: read-only file system"), { code: "EROFS" });
        map.set(h, v);
      },
    };
    const routes = { "POST /api/v1/auth/token": () => tokenOk(), "GET /api/v1/contributions": () => json(fullResult) };
    const { sk } = client(routes, { storage });
    const err = await sk.signIn().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SponsorkitError);
    expect(err).toMatchObject({ code: "invalid_config" });
    expect((err as Error).cause).toMatchObject({ code: "EROFS" });
    expect(await sk.isSignedIn()).toBe(false);

    failWrites = false;
    await sk.signIn();
    failWrites = true;
    // Background writes (cache refresh, nag counters) still never throw.
    expect((await sk.getFinancialContribution({ cacheTtl: 0 })).signedIn).toBe(true);
    await expect(sk.signOut()).rejects.toMatchObject({ code: "invalid_config" });
    expect(await sk.isSignedIn()).toBe(true);
  });

  test("a read-only storage directory makes signIn throw invalid_config", async () => {
    if (process.platform === "win32" || process.getuid?.() === 0) return; // root ignores directory permissions
    const dir = join(await tempRoot(), "ro");
    await fileStorage(dir).write("probe", "{}");
    await chmod(dir, 0o500);
    try {
      const { sk } = client({ "POST /api/v1/auth/token": () => tokenOk() }, { storage: undefined, storageDir: dir });
      await expect(sk.signIn()).rejects.toMatchObject({ code: "invalid_config" });
    } finally {
      await chmod(dir, 0o700);
    }
  });
});

describe("refresh races (PROTOCOL §7.0)", () => {
  test("the cache and a renewed token are written back only if the stored token is unchanged", async () => {
    let during: (() => void) | null = null;
    const { sk, doc, setDoc } = client({
      "POST /api/v1/auth/token": () => tokenOk("sks_first"),
      "GET /api/v1/contributions": () => {
        during?.();
        return json({ ...fullResult, contributions: [] }, { headers: { "sponsorkit-session": "sks_renewed" } });
      },
    });
    await sk.signIn();
    // Another instance signed in again while the request was in flight.
    during = () => setDoc({ ...doc(), sessionToken: "sks_other" });
    await sk.getFinancialContribution({ cacheTtl: 0 });
    expect(doc().sessionToken).toBe("sks_other");
    expect(doc().cache.result.contributions).toHaveLength(fullResult.contributions.length);

    // Another instance renewed to the same token meanwhile: still not "the token the request used".
    setDoc({ ...doc(), sessionToken: "sks_first" });
    during = () => setDoc({ ...doc(), sessionToken: "sks_renewed" });
    await sk.getFinancialContribution({ cacheTtl: 0 });
    expect(doc().cache.result.contributions).toHaveLength(fullResult.contributions.length);

    // Unchanged: the renewal and the new cache are stored.
    setDoc({ ...doc(), sessionToken: "sks_first" });
    during = null;
    await sk.getFinancialContribution({ cacheTtl: 0 });
    expect(doc().sessionToken).toBe("sks_renewed");
    expect(doc().cache.result.contributions).toEqual([]);
  });

  test("a 401 clears only the token the request used", async () => {
    let during: (() => void) | null = null;
    const { sk, doc, setDoc } = client({
      "POST /api/v1/auth/token": () => tokenOk("sks_first"),
      "GET /api/v1/contributions": () => {
        during?.();
        return json({ type: "about:blank", title: "x", status: 401, code: "session_invalid" }, { status: 401 });
      },
    });
    await sk.signIn();
    during = () => setDoc({ ...doc(), sessionToken: "sks_other" });
    await sk.getFinancialContribution({ cacheTtl: 0 });
    expect(doc().sessionToken).toBe("sks_other");
    expect(doc().cache).toBeDefined();
    during = null;
    await sk.getFinancialContribution({ cacheTtl: 0 });
    expect(doc().sessionToken).toBeUndefined();
    expect(doc().cache).toBeUndefined();
  });
});

describe("no config directory (PROTOCOL §7.0)", () => {
  test("without HOME the client uses memory storage, never the cwd, and constructs fine", async () => {
    const cwd = await tempRoot();
    const saved = { HOME: process.env.HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, APPDATA: process.env.APPDATA, USERPROFILE: process.env.USERPROFILE };
    const savedCwd = process.cwd();
    for (const k of Object.keys(saved)) delete process.env[k];
    process.chdir(cwd);
    try {
      const routes = { "POST /api/v1/auth/token": () => tokenOk(), "GET /api/v1/contributions": () => json(fullResult) };
      const { sk } = client(routes, { storage: undefined, interactive: true });
      await sk.signIn();
      expect(await sk.isSignedIn()).toBe(true);
      expect(await sk.nag({ id: "n", every: 1 }).due()).toBe(true);
      await sk.signOut();
      expect(await sk.isSignedIn()).toBe(false);
      expect(await readdir(cwd)).toEqual([]);
    } finally {
      process.chdir(savedCwd);
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe("browser launch (PROTOCOL §7.0)", () => {
  test("the loopback callback is accepted while openBrowser is still running", async () => {
    const { sk } = client(
      { "POST /api/v1/auth/token": () => tokenOk() },
      {
        signInMethod: "loopback",
        signInTimeout: 5,
        openBrowser: async (url) => {
          const redirect = new URL(url).searchParams.get("redirect_uri") as string;
          await fetch(`${redirect}?code=skc_1`);
          return new Promise<void>(() => {}); // the opener never returns
        },
      },
    );
    expect((await sk.signIn()).signedIn).toBe(true);
  });

  test("a hanging openBrowser does not block cancellation", async () => {
    const ac = new AbortController();
    const { sk } = client({}, { signInMethod: "loopback", openBrowser: () => new Promise<void>(() => {}) });
    setTimeout(() => ac.abort(), 50);
    await expect(sk.signIn({ signal: ac.signal })).rejects.toMatchObject({ code: "cancelled" });
  });

  test("the system launcher: non-zero exit fails, still running after ~1.5 s counts as opened", async () => {
    if (process.platform !== "linux") return;
    const bin = await tempRoot();
    const savedPath = process.env.PATH;
    const opener = join(bin, "xdg-open");
    process.env.PATH = `${bin}:${savedPath}`;
    try {
      await writeFile(opener, "#!/bin/sh\nexit 3\n", { mode: 0o755 });
      await expect(openSystemBrowser("https://example.com/")).rejects.toThrow(/code 3/);
      await writeFile(opener, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      await openSystemBrowser("https://example.com/");
      await writeFile(opener, "#!/bin/sh\nsleep 5\n", { mode: 0o755 });
      const started = Date.now();
      await openSystemBrowser("https://example.com/");
      const took = Date.now() - started;
      expect(took).toBeGreaterThanOrEqual(1_000);
      expect(took).toBeLessThan(3_000);
    } finally {
      process.env.PATH = savedPath;
    }
  });
});
