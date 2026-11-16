/**
 * A minimal native-style SDK written only to prove that scenarios.json is
 * consistent and executable against the fake server. It is NOT the product
 * JS SDK (sdks/js); it exists so the conformance kit tests itself end to end.
 */
import { mkdir, rename, rm, chmod } from "node:fs/promises";
import { join } from "node:path";
import {
  ContributionResult,
  InvalidTargetError,
  TokenResponse,
  targetToString,
  targetsFromOptions,
  targetsHash,
  targetsToParam,
  type Contribution,
  type Target,
} from "@sponsorkit/shared";
import { pkceChallenge, base64url } from "../src/crypto";
import { MOCK_PRESET_NAMES, mockCheckoutContribution, mockResult, type MockPresetName } from "../src/mock-presets";
import type { CheckoutArgs, ConfigureArgs, NagDueArgs, SdkAdapter, SdkInstance, TestHooks } from "../src/runner";
import { StorageFile } from "../src/storage-schema";

export class SponsorkitError extends Error {
  constructor(
    readonly code: string,
    message = code,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "SponsorkitError";
  }
}

/** PROTOCOL §7: an unreachable API, 5xx, 429 or an unexpected response during signIn/verifySession. */
async function networkError(res: Response | null): Promise<SponsorkitError> {
  if (!res) return new SponsorkitError("network_error", "The API could not be reached");
  const ra = res.headers.get("retry-after");
  const retryAfter = ra !== null && /^\d+$/.test(ra) ? Number(ra) : undefined;
  await res.arrayBuffer().catch(() => undefined);
  return new SponsorkitError("network_error", `HTTP ${res.status}`, retryAfter);
}

const VALID_FREQUENCIES = ["one_time", "monthly", "yearly"];

const isSet = (v: string | undefined) => v !== undefined && v !== "" && v !== "0" && v.toLowerCase() !== "false";

/** Per-process state, cleared by resetProcessState(). */
const processState = {
  nagCounted: new Set<string>(),
  devChecks: new Map<string, Promise<void>>(),
  retryUntil: new Map<string, number>(),
};

function parseDuration(iso: string): number {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
  if (!m || iso === "P" || iso.endsWith("T")) throw new SponsorkitError("invalid_config", `Invalid ISO-8601 duration ${iso}`);
  const [, w, d, h, min, sec] = m;
  return ((Number(w ?? 0) * 7 + Number(d ?? 0)) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(sec ?? 0)) * 1000;
}

type Stored = ReturnType<typeof StorageFile.parse>;

class ReferenceSdk implements SdkInstance {
  private readonly targets: Target[];
  private readonly param: string;
  private readonly disabled: boolean;
  private readonly mock: MockPresetName | { contributions: Contribution[] } | null;
  private readonly cacheTtl: number;
  private mockState: { signedIn: boolean; contributions: Contribution[] } | null = null;
  /** Mock mode keeps nag state in memory, per instance (PROTOCOL §7.1 item 14). */
  private readonly mockNags = new Map<string, { runs: number; lastShown: string | null }>();
  private readonly devChecks: boolean;
  private hash!: string;

  constructor(
    private readonly cfg: ConfigureArgs,
    private readonly hooks: TestHooks,
  ) {
    try {
      this.targets = targetsFromOptions({ github: cfg.github, opencollective: cfg.opencollective });
    } catch (e) {
      if (e instanceof InvalidTargetError) throw new SponsorkitError("invalid_config", e.message);
      throw e;
    }
    this.param = targetsToParam(this.targets);
    this.disabled = isSet(cfg.env.SPONSORKIT_DISABLE);
    const mock = cfg.mock ?? cfg.env.SPONSORKIT_MOCK;
    if (typeof mock === "string" && !(MOCK_PRESET_NAMES as readonly string[]).includes(mock))
      throw new SponsorkitError("invalid_config", `Unknown mock preset ${mock}`);
    this.mock = (mock as ReferenceSdk["mock"]) ?? null;
    if (this.mock && !this.disabled) {
      const r = mockResult(this.targets, this.mock);
      this.mockState = { signedIn: r.signedIn, contributions: r.contributions };
    }
    this.cacheTtl = Math.max(60, cfg.cacheTtl ?? 3600);
    this.devChecks = cfg.devChecks ?? isSet(cfg.env.SPONSORKIT_DEV_CHECKS);
  }

  async init(): Promise<this> {
    this.hash = await targetsHash(this.targets);
    return this;
  }

  private get file() {
    return join(this.cfg.storageDir, `${this.hash}.json`);
  }

  private async read(): Promise<Stored> {
    try {
      const parsed = StorageFile.safeParse(JSON.parse(await Bun.file(this.file).text()));
      if (parsed.success) return parsed.data;
    } catch {
      // missing or corrupt: start over
    }
    return { v: 1 };
  }

  private async write(update: (s: Stored) => Stored): Promise<void> {
    const next = update(await this.read());
    await mkdir(this.cfg.storageDir, { recursive: true, mode: 0o700 });
    await chmod(this.cfg.storageDir, 0o700);
    const tmp = `${this.file}.${base64url(crypto.getRandomValues(new Uint8Array(6)))}.tmp`;
    await Bun.write(tmp, JSON.stringify(next));
    await chmod(tmp, 0o600);
    await rename(tmp, this.file);
  }

  private async devCheck(): Promise<void> {
    if (!this.devChecks || this.disabled || this.mock) return;
    let p = processState.devChecks.get(this.param);
    if (!p) {
      p = (async () => {
        const q = new URLSearchParams(this.targets.map((t) => [t.provider, t.account]));
        let res: Response;
        try {
          res = await fetch(`${this.cfg.apiBaseUrl}/api/v1/targets?${q}`);
        } catch {
          return; // offline: skip the dev check
        }
        if (!res.ok) return;
        const body = (await res.json()) as { targets: { target: string; exists: boolean }[] };
        const missing = body.targets.filter((t) => !t.exists).map((t) => t.target);
        if (missing.length) throw new SponsorkitError("invalid_config", `Targets do not exist: ${missing.join(", ")}`);
      })();
      processState.devChecks.set(this.param, p);
    }
    await p;
  }

  private emptyResult(over: Partial<ContributionResult>): ContributionResult {
    return {
      signedIn: false,
      disabled: false,
      mock: false,
      targets: this.targets.map(targetToString),
      supporter: null,
      contributions: [],
      fetchedAt: null,
      stale: false,
      fromCache: false,
      ...over,
    };
  }

  private mockNow(): ContributionResult {
    const s = this.mockState!;
    if (!s.signedIn) return mockResult(this.targets, "signed-out");
    return mockResult(this.targets, { contributions: s.contributions });
  }

  async isSignedIn(): Promise<boolean> {
    if (this.disabled) return false;
    if (this.mockState) return this.mockState.signedIn;
    return !!(await this.read()).sessionToken;
  }

  async getFinancialContribution({ cacheTtl }: { cacheTtl?: number } = {}): Promise<ContributionResult> {
    if (this.disabled) return this.emptyResult({ disabled: true });
    if (this.mockState) return this.mockNow();
    await this.devCheck();
    const stored = await this.read();
    if (!stored.sessionToken) return this.emptyResult({});
    const ttl = (cacheTtl ?? this.cacheTtl) * 1000;
    const cache = stored.cache ?? null;
    if (cache && ttl > 0 && Date.now() - Date.parse(cache.storedAt) < ttl) return { ...cache.result, fromCache: true };
    const fallback = () => (cache ? { ...cache.result, fromCache: true, stale: true } : this.emptyResult({ signedIn: true, stale: true }));
    if ((processState.retryUntil.get(this.param) ?? 0) > Date.now()) return fallback();

    let res: Response;
    try {
      res = await fetch(`${this.cfg.apiBaseUrl}/api/v1/contributions`, { headers: { authorization: `Bearer ${stored.sessionToken}` } });
    } catch {
      return fallback();
    }
    if (res.status === 401) {
      await this.write((s) => ({ v: 1, nags: s.nags }));
      return this.emptyResult({});
    }
    if (res.status === 429) {
      processState.retryUntil.set(this.param, Date.now() + Number(res.headers.get("retry-after") ?? "60") * 1000);
      return fallback();
    }
    if (!res.ok) return fallback();
    const parsed = ContributionResult.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return fallback();
    let result = parsed.data;
    const unavailable = result.unavailable ?? [];
    if (unavailable.length && cache) {
      const fromCache = cache.result.contributions.filter((c) => unavailable.includes(c.provider));
      result = { ...result, contributions: [...result.contributions, ...fromCache] };
    }
    const renewed = res.headers.get("sponsorkit-session");
    await this.write((s) => ({ ...s, sessionToken: renewed ?? s.sessionToken, cache: { result, storedAt: new Date().toISOString() } }));
    return result;
  }

  private async loopback(build: (redirectUri: string) => string, signal: AbortSignal | undefined, onCode?: string): Promise<string> {
    let resolveCode!: (v: { code?: string; error?: string }) => void;
    const got = new Promise<{ code?: string; error?: string }>((r) => (resolveCode = r));
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (req) => {
        const u = new URL(req.url);
        if (u.pathname !== "/callback") return new Response("not found", { status: 404 });
        const code = u.searchParams.get("code") ?? undefined;
        const error = u.searchParams.get("error") ?? undefined;
        resolveCode({ code, error });
        if (code && onCode) return new Response(null, { status: 302, headers: { location: onCode } });
        return new Response("You can close this window.", { headers: { "content-type": "text/html" } });
      },
    });
    try {
      const url = build(`http://127.0.0.1:${server.port}/callback`);
      const timeout = setTimeout(() => resolveCode({ error: "timeout" }), (this.cfg.signInTimeout ?? 300) * 1000);
      const abort = () => resolveCode({ error: "cancelled" });
      if (signal?.aborted) abort();
      signal?.addEventListener("abort", abort, { once: true });
      try {
        await this.hooks.openBrowser(url);
        const r = await got;
        if (r.error || !r.code) throw new SponsorkitError(r.error ?? "provider_error");
        return r.code;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
    } finally {
      await server.stop(true);
    }
  }

  private async exchange(code: string, verifier: string): Promise<ContributionResult> {
    const stored = await this.read();
    const post = async (sessionToken: string | null | undefined): Promise<Response> => {
      try {
        return await fetch(`${this.cfg.apiBaseUrl}/api/v1/auth/token`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, codeVerifier: verifier, ...(sessionToken ? { sessionToken } : {}) }),
        });
      } catch {
        throw await networkError(null);
      }
    };
    let res = await post(stored.sessionToken);
    if (res.status === 401 && stored.sessionToken) {
      // Adding an identity to a dead session: clear it and retry once without sessionToken (PROTOCOL §7).
      await res.arrayBuffer();
      await this.write((s) => ({ v: 1, nags: s.nags }));
      res = await post(null);
    }
    if (res.status === 400) {
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (body.code === "invalid_code") throw new SponsorkitError("invalid_code");
      throw new SponsorkitError("network_error", `400 ${body.code ?? ""}`);
    }
    if (!res.ok) throw await networkError(res);
    const parsed = TokenResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw await networkError(null);
    const t = parsed.data;
    await this.write((s) => ({ ...s, sessionToken: t.sessionToken, cache: { result: t.result, storedAt: new Date().toISOString() } }));
    return t.result;
  }

  private connectParams(challenge: string, extra: Record<string, string>): URLSearchParams {
    const q = new URLSearchParams({ targets: this.param, challenge, ...extra });
    if (this.cfg.appName) q.set("app_name", this.cfg.appName);
    return q;
  }

  async signIn({ method, provider, signal }: { method: "loopback" | "paste"; provider?: string; signal?: AbortSignal }): Promise<unknown> {
    if (this.disabled) throw new SponsorkitError("disabled");
    if (this.mockState) {
      if (!this.mockState.signedIn) this.mockState = { signedIn: true, contributions: [] };
      return this.mockNow();
    }
    await this.devCheck();
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = await pkceChallenge(verifier);
    const extra: Record<string, string> = {};
    if (provider) extra.provider = provider;
    if (await this.isSignedIn()) extra.add = "1";
    let code: string;
    if (method === "loopback") {
      code = await this.loopback((redirectUri) => {
        const q = this.connectParams(challenge, { delivery: "loopback", redirect_uri: redirectUri, ...extra });
        return `${this.cfg.apiBaseUrl}/connect?${q}`;
      }, signal);
    } else {
      const url = `${this.cfg.apiBaseUrl}/connect?${this.connectParams(challenge, { delivery: "paste", ...extra })}`;
      code = (await this.hooks.promptForCode(url)).trim();
    }
    return this.exchange(code, verifier);
  }

  private checkoutQuery(args: { provider?: string; amount?: number; currency?: string; frequency?: string }): URLSearchParams {
    const q = new URLSearchParams({ targets: this.param });
    if (args.provider) q.set("provider", args.provider);
    if (args.amount !== undefined) q.set("amount", String(args.amount));
    if (args.currency) q.set("currency", args.currency);
    if (args.frequency) q.set("frequency", args.frequency);
    return q;
  }

  checkoutUrl(args: { provider?: string; amount?: number; currency?: string; frequency?: string }): string {
    if (args.provider !== undefined && !this.targets.some((t) => t.provider === args.provider))
      throw new SponsorkitError("invalid_config", `Provider ${args.provider} is not configured`);
    if (args.amount !== undefined && !(Number.isInteger(args.amount) && args.amount > 0))
      throw new SponsorkitError("invalid_config", "amount must be a positive integer in minor units");
    if (args.currency !== undefined && !/^[A-Z]{3}$/.test(args.currency)) throw new SponsorkitError("invalid_config", "currency must be ISO 4217");
    if (args.frequency !== undefined && !VALID_FREQUENCIES.includes(args.frequency))
      throw new SponsorkitError("invalid_config", "frequency must be one_time, monthly or yearly");
    return `${this.cfg.apiBaseUrl}/checkout?${this.checkoutQuery(args)}`;
  }

  async openCheckout(args: CheckoutArgs & { method?: "loopback" | "paste"; signal?: AbortSignal }) {
    if (this.disabled) throw new SponsorkitError("disabled");
    if (this.mockState) {
      const c = mockCheckoutContribution(this.targets, args);
      this.mockState = { signedIn: true, contributions: [...this.mockState.contributions.filter((x) => x.id !== c.id), c] };
      return { status: "contributed" as const, contribution: c };
    }
    await this.devCheck();
    this.checkoutUrl(args);
    const query = this.checkoutQuery(args);
    let baseline: ContributionResult;
    if (await this.isSignedIn()) {
      baseline = (await this.read()).cache?.result ?? (await this.getFinancialContribution({ cacheTtl: 0 }));
      await this.hooks.openBrowser(`${this.cfg.apiBaseUrl}/checkout?${query}`);
    } else {
      const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
      const challenge = await pkceChallenge(verifier);
      let code: string;
      try {
        code = await this.loopback(
          (redirectUri) => {
        const q = new URLSearchParams(query);
        q.set("challenge", challenge);
        q.set("delivery", "loopback");
        q.set("redirect_uri", redirectUri);
        if (this.cfg.appName) q.set("app_name", this.cfg.appName);
        return `${this.cfg.apiBaseUrl}/checkout?${q}`;
          },
          args.signal,
          `${this.cfg.apiBaseUrl}/checkout?${query}&step=choose`,
        );
      } catch (e) {
        if (e instanceof SponsorkitError && e.code === "cancelled") return { status: "unknown" as const };
        throw e;
      }
      baseline = await this.exchange(code, verifier);
    }
    const before = new Map(baseline.contributions.map((c) => [c.id, JSON.stringify(c)]));
    const deadline = Date.now() + (args.timeout ?? 600) * 1000;
    const interval = (args.pollInterval ?? 60) * 1000;
    while (!args.signal?.aborted && Date.now() < deadline) {
      const r = await this.getFinancialContribution({ cacheTtl: 0 });
      const changed = r.contributions.find((c) => before.get(c.id) !== JSON.stringify(c));
      if (changed) return { status: "contributed" as const, contribution: changed };
      const wait = Math.min(interval, deadline - Date.now());
      if (wait <= 0) break;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, wait);
        args.signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
      });
    }
    return { status: "unknown" as const };
  }

  async signOut(): Promise<void> {
    if (this.disabled) return;
    if (this.mockState) {
      this.mockState = { signedIn: false, contributions: [] };
      return;
    }
    if (!(await Bun.file(this.file).exists())) return;
    await this.write((s) => ({ v: 1, nags: s.nags }));
  }

  private async nagState(id: string) {
    if (this.mockState) return this.mockNags.get(id) ?? { runs: 0, lastShown: null };
    return (await this.read()).nags?.[id] ?? { runs: 0, lastShown: null };
  }

  private async setNagState(id: string, update: (prev: { runs: number; lastShown: string | null }) => { runs: number; lastShown: string | null }) {
    if (this.mockState) {
      this.mockNags.set(id, update(this.mockNags.get(id) ?? { runs: 0, lastShown: null }));
      return;
    }
    await this.write((s) => ({ ...s, nags: { ...s.nags, [id]: update(s.nags?.[id] ?? { runs: 0, lastShown: null }) } }));
  }

  async nagDue(args: NagDueArgs): Promise<boolean> {
    if (this.disabled) return false;
    const key = `${this.mockState ? "mock" : this.hash}:${args.id}`;
    if (!processState.nagCounted.has(key)) {
      processState.nagCounted.add(key);
      await this.setNagState(args.id, (prev) => ({ ...prev, runs: prev.runs + 1 }));
    }
    if (!args.force) {
      const env = this.cfg.env;
      if (isSet(env.SPONSORKIT_NO_NAG) || isSet(env.CI)) return false;
      const interactive = this.cfg.interactive ?? (!!process.stdout.isTTY && !!process.stderr.isTTY);
      if (!interactive) return false;
    }
    const fc = await this.getFinancialContribution();
    const pred =
      args.predicate === "always" ? true : args.predicate === "never" ? false : fc.contributions.filter((c) => c.status === "active").length === 0;
    if (!pred) return false;
    const state = await this.nagState(args.id);
    if (state.runs >= args.every) return true;
    if (args.orEvery && state.lastShown) return Date.now() - Date.parse(state.lastShown) >= parseDuration(args.orEvery);
    return false;
  }

  async nagShown({ id }: { id: string }): Promise<void> {
    if (this.disabled) return;
    await this.setNagState(id, () => ({ runs: 0, lastShown: new Date().toISOString() }));
  }
}

export const referenceAdapter: SdkAdapter = {
  async create(config, hooks) {
    return new ReferenceSdk(config, hooks).init();
  },
  resetProcessState() {
    processState.nagCounted.clear();
    processState.devChecks.clear();
    processState.retryUntil.clear();
  },
  async verifySession(token, targets, { apiBaseUrl }) {
    let expected: string;
    try {
      expected = targetsToParam(targetsFromOptions(targets));
    } catch (e) {
      throw new SponsorkitError("invalid_config", String(e));
    }
    let res: Response;
    try {
      res = await fetch(`${apiBaseUrl}/api/v1/contributions`, { headers: { authorization: `Bearer ${token}` } });
    } catch {
      throw await networkError(null);
    }
    if (res.status === 401) throw new SponsorkitError("session_invalid");
    if (!res.ok) throw await networkError(res);
    const parsed = ContributionResult.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw await networkError(null);
    const result = parsed.data;
    if (result.targets.join(",") !== expected) throw new SponsorkitError("targets_mismatch");
    return result;
  },
  errorCode(error) {
    return error instanceof SponsorkitError ? error.code : undefined;
  },
  errorRetryAfter(error) {
    return error instanceof SponsorkitError ? error.retryAfter : undefined;
  },
};

/** Removes a directory tree (test cleanup helper). */
export const removeTree = (path: string) => rm(path, { recursive: true, force: true });
