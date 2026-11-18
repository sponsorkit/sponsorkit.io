/**
 * Reference scenario runner. It executes scenarios.json against any SDK that
 * implements {@link SdkAdapter}, and doubles as an executable specification of
 * the step semantics in README.md for SDK authors in other languages.
 *
 * TypeScript/JavaScript SDKs can use it directly:
 *
 *   const server = await startServer();
 *   for (const s of loadScenarios(json).scenarios)
 *     test(s.id, () => runScenario(s, adapter, { baseUrl: server.baseUrl, siteBaseUrl: server.siteBaseUrl, storageRoot, variables }));
 */
import { chmod, mkdir, readdir, stat } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { type ContributionResult } from "@sponsorkit/shared";
import { match, matchRequests, substitute, type LoggedRequest, type Vars } from "./matcher";
import { ScenariosFile, type Step } from "./scenario-schema";
import { StorageFile } from "./storage-schema";
import { z } from "zod";

export type ParsedScenario = z.output<typeof ScenariosFile>["scenarios"][number];
export type ParsedStep = z.output<typeof ScenariosFile>["scenarios"][number]["steps"][number];
type SimpleStep = Exclude<ParsedStep, { action: "parallel" } | { action: "group" }>;
export type ConfigureArgs = Extract<SimpleStep, { action: "configure" }>["args"];
export type CheckoutArgs = Extract<SimpleStep, { action: "openCheckout" }>["args"];
export type NagDueArgs = Extract<SimpleStep, { action: "nagDue" }>["args"];

/** Hooks the runner gives the SDK (PROTOCOL §7). */
export interface TestHooks {
  /** Replacement for the system browser: GET the URL and follow redirects. */
  openBrowser(url: string): Promise<void>;
  /** Replacement for reading stdin: visits the paste URL like a user would and returns the displayed code. */
  promptForCode(pasteUrl: string): Promise<string>;
}

export interface SdkInstance {
  signIn(args: { method: "loopback" | "paste"; provider?: string; signal?: AbortSignal }): Promise<unknown>;
  isSignedIn(): boolean | Promise<boolean>;
  getFinancialContribution(args: { cacheTtl?: number }): Promise<ContributionResult>;
  openCheckout(args: CheckoutArgs & { signal?: AbortSignal }): Promise<{ status: "contributed" | "unknown"; contribution?: unknown }>;
  /** Must throw invalid_config for an unconfigured provider or an invalid amount, currency or frequency. */
  checkoutUrl(args: { provider?: string; amount?: number; currency?: string; frequency?: string }): string;
  signOut(): Promise<void>;
  nagDue(args: NagDueArgs): Promise<boolean>;
  nagShown(args: { id: string }): Promise<void> | void;
}

export interface SdkAdapter {
  /** Construct an SDK instance. Must throw (synchronously or not) on invalid configuration. */
  create(config: ConfigureArgs, hooks: TestHooks): SdkInstance | Promise<SdkInstance>;
  /** `restart` step: forget all per-process state (nag run memo, dev-check memo, Retry-After memo). */
  resetProcessState(): void | Promise<void>;
  verifySession(token: string, targets: { github?: string; opencollective?: string }, opts: { apiBaseUrl: string }): Promise<ContributionResult>;
  /** The SponsorkitError code of a thrown value, or undefined if it is not a SponsorkitError. */
  errorCode(error: unknown): string | undefined;
  /** The `retryAfter` (seconds) of a thrown SponsorkitError, or undefined when it carries none. */
  errorRetryAfter?(error: unknown): number | undefined;
}

export interface RunContext {
  /** The fake server's API base URL (`$BASE_URL`). */
  baseUrl: string;
  /**
   * The fake server's site base URL (`$SITE_BASE_URL`): `http://127.0.0.1:<sitePort>/sponsorkit.io`.
   * When omitted, the runner reads it from `GET /__control` -> `siteBaseUrl`.
   */
  siteBaseUrl?: string;
  /** The `variables` map of scenarios.json (constant entries are substituted; "runtime:" entries are computed). */
  variables: Record<string, string>;
  /** An existing directory; each scenario gets a fresh, not-yet-existing $STORAGE_DIR below it. */
  storageRoot: string;
}

export class ScenarioFailure extends Error {
  constructor(
    readonly scenario: string,
    readonly step: string,
    readonly problems: string[],
  ) {
    super(`${scenario} / ${step}:\n  - ${problems.join("\n  - ")}`);
    this.name = "ScenarioFailure";
  }
}

export function loadScenarios(json: unknown): z.output<typeof ScenariosFile> {
  return ScenariosFile.parse(json);
}

class Control {
  constructor(private readonly baseUrl: string) {}
  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json()) as T;
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
    return data;
  }
  state() {
    return this.call<{ lastSessionToken: string | null; issuedSessionTokens: string[]; lastRequestSeq: number; siteBaseUrl?: string | null }>(
      "GET",
      "/__control",
    );
  }
  async requests(since: number): Promise<LoggedRequest[]> {
    return (await this.call<{ requests: LoggedRequest[] }>("GET", `/__control/requests?since=${since}`)).requests;
  }
}

/** The runner's openBrowser: an HTTP GET that follows redirects, like a browser with no JavaScript. */
export async function followRedirects(url: string): Promise<Response> {
  const res = await fetch(url, { redirect: "follow" });
  await res.arrayBuffer();
  return res;
}

function normalize(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

async function fileExists(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

function globCount(pattern: string): Promise<number> {
  const dir = dirname(pattern);
  const re = new RegExp(`^${basename(pattern).split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  return readdir(dir)
    .then((names) => names.filter((n) => re.test(n)).length)
    .catch(() => 0);
}

export async function runScenario(scenario: ParsedScenario, adapter: SdkAdapter, ctx: RunContext): Promise<void> {
  const control = new Control(ctx.baseUrl);
  const storageDir = join(ctx.storageRoot, `${scenario.id}-${crypto.randomUUID().slice(0, 8)}`);
  await control.call("POST", "/__control/reset");
  await control.call("POST", "/__control", { scenario: scenario.id });
  await adapter.resetProcessState();
  const unreachable = (await control.call<{ baseUrl: string }>("GET", "/__control/unreachable")).baseUrl;
  const initial = await control.state();
  const startSeq = initial.lastRequestSeq;
  const siteBaseUrl = ctx.siteBaseUrl ?? initial.siteBaseUrl;
  if (!siteBaseUrl) throw new Error("No site base URL: pass RunContext.siteBaseUrl or use a fake server that reports GET /__control -> siteBaseUrl");

  const staticVars: Vars = {
    $BASE_URL: ctx.baseUrl,
    $SITE_BASE_URL: siteBaseUrl,
    $STORAGE_DIR: storageDir,
    $UNREACHABLE_BASE_URL: unreachable,
  };
  let minted: string | null = null;
  const vars = async (): Promise<Vars> => {
    const s = await control.state();
    const v: Vars = { ...staticVars, $NOW: new Date().toISOString() };
    if (s.lastSessionToken) v.$LAST_SESSION_TOKEN = s.lastSessionToken;
    s.issuedSessionTokens.forEach((t, i) => (v[`$SESSION_TOKEN_${i + 1}`] = t));
    if (minted) v.$MINTED_SESSION_TOKEN = minted;
    return v;
  };
  // Constant variables from the scenarios file ($STORAGE_FILE, $TARGETS_HASH, ...) are expanded first (twice: they may nest).
  const constants: Vars = Object.fromEntries(Object.entries(ctx.variables).filter(([, v]) => !v.startsWith("runtime:")));
  const resolve = async <T>(value: T): Promise<T> => substitute(substitute(substitute(value, constants), constants), await vars());

  const hooks: TestHooks = {
    openBrowser: async (url) => {
      await followRedirects(url);
    },
    promptForCode: async (url) => {
      const res = await followRedirects(url);
      const code = res.headers.get("sponsorkit-conformance-code");
      if (!code) throw new Error(`No code at ${url} (status ${res.status})`);
      return code;
    },
  };

  const savedEnv = new Map<string, string | undefined>();
  const setProcessEnv = (vars: Record<string, string> | undefined) => {
    for (const [k, v] of Object.entries(vars ?? {})) {
      if (!savedEnv.has(k)) savedEnv.set(k, process.env[k]);
      process.env[k] = v;
    }
  };
  const restoreProcessEnv = () => {
    for (const [k, v] of savedEnv) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    savedEnv.clear();
  };

  let config: ConfigureArgs | null = null;
  let instance: SdkInstance | null = null;
  const exec = async (step: SimpleStep, on: SdkInstance | null = instance): Promise<unknown> => {
    const need = () => {
      if (!on) throw new Error("No SDK instance (configure failed or was not called)");
      return on;
    };
    switch (step.action) {
      case "configure":
        instance = null;
        config = step.args;
        setProcessEnv(step.args.processEnv);
        instance = await adapter.create(step.args, hooks);
        return null;
      case "restart":
        if (!config) throw new Error("restart before configure");
        instance = null;
        await adapter.resetProcessState();
        instance = await adapter.create(config, hooks);
        return null;
      case "signIn": {
        const { cancelAfter, ...rest } = step.args;
        const ac = new AbortController();
        const timer = cancelAfter !== undefined ? setTimeout(() => ac.abort(), cancelAfter * 1000) : undefined;
        try {
          await need().signIn({ ...rest, signal: ac.signal });
        } finally {
          clearTimeout(timer);
        }
        return null;
      }
      case "isSignedIn":
        return need().isSignedIn();
      case "getFinancialContribution":
        return need().getFinancialContribution(step.args);
      case "openCheckout": {
        const { cancelAfter, ...rest } = step.args;
        const ac = new AbortController();
        const timer = cancelAfter !== undefined ? setTimeout(() => ac.abort(), cancelAfter * 1000) : undefined;
        try {
          return await need().openCheckout({ ...rest, signal: ac.signal });
        } finally {
          clearTimeout(timer);
        }
      }
      case "checkoutUrl":
        return need().checkoutUrl(step.args);
      case "signOut":
        await need().signOut();
        return null;
      case "nagDue":
        return need().nagDue(step.args);
      case "nagShown":
        await need().nagShown(step.args);
        return null;
      case "verifySession":
        return adapter.verifySession(step.args.token, step.args.targets, { apiBaseUrl: step.args.apiBaseUrl });
      case "control":
        await control.call("PATCH", "/__control", step.args);
        return null;
      case "mintSession": {
        const r = await control.call<{ sessionToken: string; expiresAt: string }>("POST", "/__control/sessions", step.args);
        minted = r.sessionToken;
        return r;
      }
      case "writeStorage": {
        const path = step.args.path;
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        await Bun.write(path, JSON.stringify(step.args.json));
        await chmod(path, 0o600).catch(() => undefined);
        return null;
      }
      case "wait":
        await Bun.sleep(step.args.seconds * 1000);
        return null;
    }
  };

  try {
    for (const [index, rawStep] of scenario.steps.entries()) {
      const label = `step ${index + 1} (${rawStep.action})`;
      const seq = (await control.state()).lastRequestSeq;
      const started = performance.now();
      let returned: unknown = null;
      let thrown: unknown = undefined;
      let threw = false;
      try {
        if (rawStep.action === "group") {
          for (const s of rawStep.steps) returned = await exec(await resolve(s as SimpleStep));
        } else if (rawStep.action === "parallel") {
          if (!config) throw new Error("parallel before configure");
          const inner = await resolve(rawStep.args.step as SimpleStep);
          const instances = await Promise.all(Array.from({ length: rawStep.args.instances }, () => adapter.create(config!, hooks)));
          returned = await Promise.all(instances.map((i) => exec(inner, i)));
        } else {
          returned = await exec(await resolve(rawStep as SimpleStep));
        }
      } catch (e) {
        threw = true;
        thrown = e;
      }
      const seconds = (performance.now() - started) / 1000;
      const expect = rawStep.expect;
      const problems: string[] = [];
      if (threw) {
        const code = adapter.errorCode(thrown);
        if (!expect?.throws) problems.push(`unexpected error: ${code ?? String(thrown)}`);
        else if (code !== expect.throws) problems.push(`expected error ${expect.throws}, got ${code ?? String(thrown)}`);
      } else if (expect?.throws) {
        problems.push(`expected error ${expect.throws}, but the step succeeded`);
      }
      if (expect) {
        const e = await resolve(expect);
        const value = normalize(returned);
        if (!threw && e.returns !== undefined) problems.push(...match(value, e.returns, "returns"));
        if (threw && e.error !== undefined) {
          const retryAfter = adapter.errorRetryAfter?.(thrown);
          problems.push(...match({ code: adapter.errorCode(thrown) ?? null, retryAfter: retryAfter ?? null }, e.error, "error"));
        }
        if (!threw && e.contributionIds) {
          const v = value as { contributions?: { id: string }[]; contribution?: { id: string } } | null;
          const got = (v?.contributions ?? (v?.contribution ? [v.contribution] : [])).map((c) => c.id).sort();
          const want = [...e.contributionIds].sort();
          if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`contribution ids ${JSON.stringify(got)} !== ${JSON.stringify(want)}`);
        }
        if (e.requests) problems.push(...matchRequests(await control.requests(seq), e.requests));
        if (e.minSeconds !== undefined && seconds < e.minSeconds) problems.push(`took ${seconds.toFixed(2)} s, expected >= ${e.minSeconds}`);
        if (e.maxSeconds !== undefined && seconds > e.maxSeconds) problems.push(`took ${seconds.toFixed(2)} s, expected <= ${e.maxSeconds}`);
      }
      if (problems.length) throw new ScenarioFailure(scenario.id, label, problems);
    }
  } finally {
    restoreProcessEnv();
  }

  const final = scenario.expect;
  if (final) {
    const e = await resolve(final);
    const problems: string[] = [];
    if (e.requests) problems.push(...matchRequests(await control.requests(startSeq), e.requests));
    for (const f of e.files ?? []) {
      if ("glob" in f) {
        const n = await globCount(f.glob);
        if (n !== f.count) problems.push(`${f.glob}: ${n} file(s), expected ${f.count}`);
        continue;
      }
      const st = await fileExists(f.path);
      if (f.exists === true && !st) problems.push(`${f.path}: does not exist`);
      if (f.exists === false && st) problems.push(`${f.path}: exists but should not`);
      if (!st) continue;
      if (f.kind === "directory" && !st.isDirectory()) problems.push(`${f.path}: not a directory`);
      if (f.kind === "file" && !st.isFile()) problems.push(`${f.path}: not a file`);
      if (f.mode && process.platform !== "win32") {
        const mode = `0${(st.mode & 0o777).toString(8)}`;
        if (mode !== f.mode) problems.push(`${f.path}: mode ${mode}, expected ${f.mode}`);
      }
      if (f.json !== undefined || f.schema) {
        let data: unknown;
        try {
          data = JSON.parse(await Bun.file(f.path).text());
        } catch (err) {
          problems.push(`${f.path}: not valid JSON (${String(err)})`);
          continue;
        }
        if (f.schema === "storage-file") {
          const r = StorageFile.safeParse(data);
          if (!r.success) problems.push(`${f.path}: does not match the storage-file schema: ${z.prettifyError(r.error)}`);
        }
        if (f.json !== undefined) problems.push(...match(data, f.json, basename(f.path)));
      }
    }
    if (problems.length) throw new ScenarioFailure(scenario.id, "final expectations", problems);
  }
}

export type { Step };
