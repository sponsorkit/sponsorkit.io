/**
 * Platform-independent client logic: configuration, cache, error contract,
 * checkout polling, nag and mock mode. `Sponsorkit` in `@sponsorkit/sdk`
 * (browser) and `@sponsorkit/sdk/node` (native) extend this class with their
 * sign-in flows and storage.
 */
import { SponsorkitError } from "./errors";
import { type FetchLike, fetchContributions, fetchTargets, problemCode, requestTimeoutMs, resolveFetch, retryAfterSeconds, withTimeout } from "./http";
import { initialMockState, type MockState, mockCheckoutContribution, mockResult, parseMockOption } from "./mock";
import { FinancialContribution } from "./result";
import { type SponsorkitStorage, Store, type WebStorageLike } from "./storage";
import { codeChallenge, createCodeVerifier, type Target, targetsFrom, targetsHash, targetsParam, targetToString } from "./targets";
import type { CheckoutOptions, CheckoutResult, Contribution, ContributionResult, Frequency, MockOption, NagState, Provider, StorageFile } from "./types";
import { DEFAULT_API_BASE_URL, durationMs, type Env, isEnvSet, isObject, normalizeBaseUrl, processEnv, sleep, stableStringify } from "./util";

export { DEFAULT_API_BASE_URL };
/** Default `cacheTtl` in seconds. */
export const DEFAULT_CACHE_TTL = 3600;
/** Minimum constructor `cacheTtl` in seconds (SPEC §7.1). */
export const MIN_CACHE_TTL = 60;
/** Default checkout poll interval in seconds. */
export const DEFAULT_CHECKOUT_POLL_INTERVAL = 60;
/** Default checkout timeout in seconds (polling phase only). */
export const DEFAULT_CHECKOUT_TIMEOUT = 600;
/** Default `signInTimeout` in seconds. */
export const DEFAULT_SIGN_IN_TIMEOUT = 300;

/** Options shared by every `Sponsorkit` flavour. */
export interface SponsorkitCoreOptions {
  /** GitHub user or organization login that receives sponsorships. */
  github?: string;
  /** Open Collective collective slug that receives contributions. */
  opencollective?: string;
  /** Seconds a cached result is served without calling the API. Default 3600, minimum 60. */
  cacheTtl?: number;
  /** Mock mode (SPEC §7.4): a preset name or `{ contributions }`. Overrides `SPONSORKIT_MOCK`. */
  mock?: MockOption;
  /** Where the session token, cache and nag state live. Accepts a {@link SponsorkitStorage} or a Web Storage object. */
  storage?: SponsorkitStorage | WebStorageLike;
  /** API origin, for self-hosting and tests. Default `https://sponsorkit.io`. */
  apiBaseUrl?: string;
  /**
   * Environment used for `SPONSORKIT_DISABLE`, `SPONSORKIT_MOCK`, `SPONSORKIT_NO_NAG`, `SPONSORKIT_DEV_CHECKS` and `CI`.
   * When given, it **replaces** the process environment for these variables (it is not merged). Default: the process environment.
   */
  env?: Env;
  /**
   * Forces the dev-time target existence check on or off. Default: on when `SPONSORKIT_DEV_CHECKS` is set
   * (in `env`) or `process.env.NODE_ENV` is `development` (bundlers inline it), off otherwise.
   */
  devChecks?: boolean;
  /** Seconds to wait for a sign-in (popup, loopback or paste-back) before rejecting with `timeout`. Default 300. */
  signInTimeout?: number;
  /** Seconds between checkout polls. Default 60. */
  checkoutPollInterval?: number;
  /** Clock in epoch milliseconds, used for cache TTL, `Retry-After` and nag timing. Default `Date.now`. */
  clock?: () => number;
  /** Custom `fetch` implementation. Default: the global `fetch`. */
  fetch?: FetchLike;
  /**
   * Seconds before an API request is abandoned. `getFinancialContribution()` then serves the stale cache;
   * the sign-in code exchange rejects with `network_error`. Default 30; `0` disables the limit.
   */
  requestTimeout?: number;
  /** Whether the app runs interactively, for `nag().due()`. Overrides platform detection (TTY on native). */
  interactive?: boolean;
}

/** Options for `signIn()`. */
export interface SignInOptions {
  /** Skip the provider picker. Signing in with a second provider adds that identity to the session. */
  provider?: Provider;
  /** Cancels the sign-in; `signIn()` then rejects with `cancelled`. */
  signal?: AbortSignal;
}

/** Options for `openCheckout()`. */
export interface OpenCheckoutOptions extends CheckoutOptions {
  /** Seconds to wait for a new contribution, counted from when polling starts (sign-in uses `signInTimeout`). Default 600. */
  timeout?: number;
  /** Cancels sign-in or waiting; `openCheckout()` then resolves `{ status: "unknown" }`. */
  signal?: AbortSignal;
  /** Seconds between polls; overrides the `checkoutPollInterval` option. */
  pollInterval?: number;
}

/** Options for `nag()`. */
export interface NagOptions {
  /** Stable id of this nag (e.g. your app name). */
  id: string;
  /** Due after this many runs (processes) since it was last shown. */
  every: number;
  /** Also due when this much time passed since it was last shown: ISO-8601 duration (`"P7D"`) or seconds. */
  orEvery?: string | number;
}

/** Options for `Nag.due()`. */
export interface NagDueOptions {
  /** Bypass the TTY, `CI` and `SPONSORKIT_NO_NAG` checks (not `SPONSORKIT_DISABLE`). */
  force?: boolean;
}

/** A predicate deciding whether the current supporter should see the nag. */
export type NagPredicate = (fc: FinancialContribution) => boolean | Promise<boolean>;

/** Nag helper returned by `Sponsorkit.nag()` (SPEC §7.5). */
export interface Nag {
  /**
   * Counts this run (once per process) and returns whether to show the nag:
   * `predicate(fc) && (runs >= every || since(lastShown) >= orEvery)`.
   * Always false when disabled, in CI, with `SPONSORKIT_NO_NAG`, or without a TTY, unless `force`.
   */
  due(predicate?: NagPredicate, options?: NagDueOptions): Promise<boolean>;
  /** Records that the nag was shown: resets the run counter and `lastShown`. */
  shown(): Promise<void>;
}

/** @internal A request for a sign-in code, handed to the platform. */
export interface CodeRequest {
  /** `/connect` or `/checkout`. */
  path: "/connect" | "/checkout";
  /** targets, challenge and optional provider/add/checkout params. Delivery params are added by the platform. */
  params: URLSearchParams;
  /** PKCE verifier (for flows that must persist it, e.g. browser redirects). */
  verifier: string;
  /** For checkout: where the browser continues after sign-in. */
  continueUrl?: string;
  /** Aborted on cancellation or `signInTimeout`; its `reason` is the `SponsorkitError` to reject with (see {@link abortError}). */
  signal: AbortSignal;
  /** Platform-specific method override passed by the caller (native: `loopback` / `paste`). */
  method?: string;
}

/** Per-process memo state (PROTOCOL §7 `restart`). */
const processState = {
  nagCounted: new Set<string>(),
  devChecks: new Map<string, Promise<void>>(),
  retryUntil: new Map<string, number>(),
};

/**
 * Forgets per-process state: nag runs already counted, the dev-check memo and
 * the `Retry-After` memo. Simulates a new process (tests).
 */
export function resetProcessState(): void {
  processState.nagCounted.clear();
  processState.devChecks.clear();
  processState.retryUntil.clear();
}

const FREQUENCIES: readonly Frequency[] = ["one_time", "monthly", "yearly"];

/**
 * The error a sign-in rejects with once `signal` aborted: `cancelled` or `timeout`
 * (the signal's reason when it is a {@link SponsorkitError}).
 */
export function abortError(signal: AbortSignal): SponsorkitError {
  return signal.reason instanceof SponsorkitError ? signal.reason : new SponsorkitError("cancelled", "Sign-in was cancelled");
}

/**
 * Combines an optional user signal with a deadline into one signal whose reason
 * is a `cancelled` (user signal) or `timeout` (deadline) {@link SponsorkitError}.
 */
function combineSignals(signal: AbortSignal | undefined, timeoutMs: number | null, what: string): { signal: AbortSignal; dispose(): void } {
  const ac = new AbortController();
  const cancel = () => ac.abort(new SponsorkitError("cancelled", `${what} was cancelled`));
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = timeoutMs === null ? undefined : setTimeout(() => ac.abort(new SponsorkitError("timeout", `${what} timed out`)), Math.max(0, timeoutMs));
  return {
    signal: ac.signal,
    dispose() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    },
  };
}

/** Base class with the shared client behaviour. Use `Sponsorkit` from `@sponsorkit/sdk` or `@sponsorkit/sdk/node`. */
/**
 * `process.env.NODE_ENV`, written literally so bundlers can inline it; undefined
 * where there is no `process` (e.g. browsers without a bundler define).
 */
function buildMode(): string | undefined {
  try {
    return process.env.NODE_ENV;
  } catch {
    return undefined;
  }
}

export abstract class SponsorkitCore<I = unknown> {
  /** Resets per-process memo state (same as the `resetProcessState()` export). */
  static resetProcessState(): void {
    resetProcessState();
  }

  /** Canonical target strings, e.g. `["github:octocat"]`. */
  readonly targets: readonly string[];
  /** Canonical target param (`github:x,opencollective:y`). */
  readonly targetsParam: string;
  /** API origin in use. */
  readonly apiBaseUrl: string;
  /** True when `SPONSORKIT_DISABLE` is set: no network, no disk, signed-out `disabled` results. */
  readonly disabled: boolean;
  /** True in mock mode. */
  readonly isMock: boolean;

  protected readonly targetList: readonly Target[];
  protected readonly env: Env;
  protected readonly cacheTtl: number;
  protected readonly devChecks: boolean;
  protected readonly pollInterval: number;
  protected readonly signInTimeoutMs: number;
  protected readonly now: () => number;
  protected readonly fetchFn: FetchLike;
  protected readonly interactiveOverride: boolean | undefined;
  private readonly storageOption: SponsorkitStorage | WebStorageLike | undefined;
  private mockState: MockState | null = null;
  private readonly mockNags: Record<string, NagState> = {};
  private readonly mockNagCounted = new Set<string>();
  private storeInstance: Store | null = null;
  private hashPromise: Promise<string> | null = null;

  constructor(options: SponsorkitCoreOptions) {
    if (!options || typeof options !== "object") throw new SponsorkitError("invalid_config", "Options are required");
    this.targetList = targetsFrom({ github: options.github, opencollective: options.opencollective });
    this.targets = this.targetList.map(targetToString);
    this.targetsParam = targetsParam(this.targetList);
    this.apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl ?? DEFAULT_API_BASE_URL);
    this.env = options.env ?? processEnv();
    const ttl = options.cacheTtl ?? DEFAULT_CACHE_TTL;
    if (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl < 0) throw new SponsorkitError("invalid_config", "cacheTtl must be a number of seconds");
    this.cacheTtl = Math.max(MIN_CACHE_TTL, ttl);
    const interval = options.checkoutPollInterval ?? DEFAULT_CHECKOUT_POLL_INTERVAL;
    if (typeof interval !== "number" || !(interval > 0)) throw new SponsorkitError("invalid_config", "checkoutPollInterval must be positive");
    this.pollInterval = interval;
    const signInTimeout = options.signInTimeout ?? DEFAULT_SIGN_IN_TIMEOUT;
    if (typeof signInTimeout !== "number" || !(signInTimeout > 0))
      throw new SponsorkitError("invalid_config", "signInTimeout must be a positive number of seconds");
    this.signInTimeoutMs = signInTimeout * 1000;
    this.now = options.clock ?? Date.now;
    this.fetchFn = withTimeout(resolveFetch(options.fetch), requestTimeoutMs(options.requestTimeout));
    this.interactiveOverride = options.interactive;
    this.storageOption = options.storage;
    this.disabled = isEnvSet(this.env.SPONSORKIT_DISABLE);
    const envMock = this.env.SPONSORKIT_MOCK?.trim() ? this.env.SPONSORKIT_MOCK.trim() : undefined;
    const mock = parseMockOption(options.mock ?? envMock);
    if (mock && !this.disabled) this.mockState = initialMockState(this.targetList, mock);
    this.isMock = this.mockState !== null;
    // PROTOCOL §7 devChecks default: SPONSORKIT_DEV_CHECKS, else only the JS signal NODE_ENV=development.
    this.devChecks = options.devChecks ?? (isEnvSet(this.env.SPONSORKIT_DEV_CHECKS) || buildMode() === "development");
  }

  // ---------------------------------------------------------------- platform hooks

  /** Storage used when the `storage` option is not given. */
  protected abstract defaultStorage(): SponsorkitStorage;
  /** A lock identity for the storage (same file/area => same object). */
  protected storageLockKey(storage: SponsorkitStorage): object {
    return storage;
  }
  /** Called synchronously at the start of `signIn()`/`openCheckout()` (browser: opens the popup). */
  protected abstract beginInteraction(kind: "signIn" | "checkout"): I;
  /** Cleans up after an interaction failed or finished early (browser: closes the popup). */
  protected abstract endInteraction(interaction: I): void;
  /** Runs a sign-in delivery flow and returns the sign-in code. */
  protected abstract obtainCode(interaction: I, request: CodeRequest): Promise<string>;
  /** Shows the checkout page (already signed in). */
  protected abstract showCheckout(interaction: I, url: string, signal: AbortSignal): Promise<void>;
  /** Waits until polling should start (browser: until the popup closes). */
  protected async beforePolling(_interaction: I, _signal: AbortSignal): Promise<void> {}
  /** Whether the app is interactive (TTY on native). */
  protected abstract detectInteractive(): boolean;
  /** Hook run before async operations (after the dev check). */
  protected async prepare(): Promise<void> {}

  // ---------------------------------------------------------------- public API

  /** Whether a session token is stored (no network). */
  async isSignedIn(): Promise<boolean> {
    if (this.disabled) return false;
    if (this.mockState) return this.mockState.signedIn;
    await this.prepare();
    return !!(await this.readStorage()).sessionToken;
  }

  /**
   * The stored session token (`sks_…`), for forwarding to your backend's
   * `verifySession()`. `null` when signed out, disabled or in mock mode.
   */
  async getSessionToken(): Promise<string | null> {
    if (this.disabled || this.mockState) return null;
    await this.prepare();
    return (await this.readStorage()).sessionToken ?? null;
  }

  /**
   * What the current user has contributed to the targets. Never throws for
   * network or server problems: it serves the cache or a `stale` result.
   *
   * @param options.cacheTtl Seconds a cached result may be served; `0` always refreshes.
   */
  async getFinancialContribution(options: { cacheTtl?: number } = {}): Promise<FinancialContribution> {
    if (this.disabled) return new FinancialContribution(this.emptyResult({ disabled: true }));
    if (this.mockState) return new FinancialContribution(mockResult(this.targetList, this.mockState));
    await this.devCheck();
    await this.prepare();
    const ttl = options.cacheTtl ?? this.cacheTtl;
    return new FinancialContribution(await this.refresh(ttl));
  }

  /**
   * Signs the user in (or adds a second identity when already signed in) and
   * returns the fresh result. Rejects with `disabled`, `invalid_config`, `popup_blocked`,
   * `access_denied`, `invalid_state`, `provider_error`, `invalid_code`, `cancelled`
   * (`signal` aborted, popup closed), `timeout` (`signInTimeout`) or `network_error`.
   */
  async signIn(options: SignInOptions = {}): Promise<FinancialContribution> {
    if (this.disabled) throw new SponsorkitError("disabled", "Sponsorkit is disabled (SPONSORKIT_DISABLE)");
    if (options.provider !== undefined && !this.targetList.some((t) => t.provider === options.provider)) {
      throw new SponsorkitError("invalid_config", `No ${options.provider} target is configured`);
    }
    if (this.mockState) {
      if (!this.mockState.signedIn) this.mockState = { signedIn: true, contributions: [] };
      return new FinancialContribution(mockResult(this.targetList, this.mockState));
    }
    const interaction = this.beginInteraction("signIn");
    const { signal, dispose } = combineSignals(options.signal, this.signInTimeoutMs, "Sign-in");
    try {
      await this.devCheck();
      await this.prepare();
      const signedIn = !!(await this.readStorage()).sessionToken;
      const verifier = createCodeVerifier();
      const params = new URLSearchParams({ targets: this.targetsParam, challenge: await codeChallenge(verifier) });
      if (options.provider) params.set("provider", options.provider);
      if (signedIn) params.set("add", "1");
      const method = (options as { method?: string }).method;
      const code = await this.obtainCode(interaction, { path: "/connect", params, verifier, signal, method });
      if (signal.aborted) throw abortError(signal);
      return new FinancialContribution(await this.exchange(code, verifier));
    } catch (e) {
      this.endInteraction(interaction);
      if (signal.aborted && !(e instanceof SponsorkitError)) throw abortError(signal);
      throw e;
    } finally {
      dispose();
    }
  }

  /**
   * Sends the user to contribute and waits for the new contribution (SPEC §7.3):
   * signs in first if needed, opens `/checkout`, then polls with `cacheTtl: 0`
   * until a new or changed contribution appears. Resolves `{ status: "unknown" }`
   * on timeout or cancellation.
   */
  async openCheckout(options: OpenCheckoutOptions = {}): Promise<CheckoutResult> {
    if (this.disabled) throw new SponsorkitError("disabled", "Sponsorkit is disabled (SPONSORKIT_DISABLE)");
    const query = this.checkoutQuery(options);
    const timeout = options.timeout ?? DEFAULT_CHECKOUT_TIMEOUT;
    if (typeof timeout !== "number" || !(timeout >= 0)) throw new SponsorkitError("invalid_config", "timeout must be a number of seconds");
    if (this.mockState) {
      const c = mockCheckoutContribution(this.targetList, options);
      this.mockState = { signedIn: true, contributions: [...this.mockState.contributions.filter((x) => x.id !== c.id), c] };
      return { status: "contributed", contribution: c };
    }
    const interaction = this.beginInteraction("checkout");
    const interval = (options.pollInterval ?? this.pollInterval) * 1000;
    let disposePolling = () => {};
    // PROTOCOL §7.1 item 15: `timeout` covers only the polling phase.
    const startPolling = () => {
      const polling = combineSignals(options.signal, timeout * 1000, "Checkout");
      disposePolling = polling.dispose;
      return { signal: polling.signal, deadline: Date.now() + timeout * 1000 };
    };
    try {
      await this.devCheck();
      await this.prepare();
      const stored = await this.readStorage();
      let baseline: ContributionResult;
      if (stored.sessionToken) {
        baseline = stored.cache?.result ?? (await this.refresh(0));
      } else {
        // Sign-in phase: bounded by signInTimeout; cancellation resolves "unknown", a sign-in timeout throws `timeout`.
        const signIn = combineSignals(options.signal, this.signInTimeoutMs, "Sign-in");
        try {
          const verifier = createCodeVerifier();
          const params = new URLSearchParams(query);
          params.set("challenge", await codeChallenge(verifier));
          let code: string;
          try {
            code = await this.obtainCode(interaction, {
              path: "/checkout",
              params,
              verifier,
              signal: signIn.signal,
              method: (options as { method?: string }).method,
              continueUrl: `${this.apiBaseUrl}/checkout?${query}&step=choose`,
            });
            if (signIn.signal.aborted) throw abortError(signIn.signal);
          } catch (e) {
            const err = signIn.signal.aborted ? abortError(signIn.signal) : e;
            if (err instanceof SponsorkitError && err.code === "cancelled" && options.signal?.aborted) {
              this.endInteraction(interaction);
              return { status: "unknown" };
            }
            throw err;
          }
          baseline = await this.exchange(code, verifier);
        } finally {
          signIn.dispose();
        }
      }
      const { signal, deadline } = startPolling();
      if (stored.sessionToken) await this.showCheckout(interaction, `${this.apiBaseUrl}/checkout?${query}`, signal);
      await this.beforePolling(interaction, signal);
      return await this.pollForContribution(baseline, deadline, interval, signal);
    } catch (e) {
      this.endInteraction(interaction);
      throw e;
    } finally {
      disposePolling();
    }
  }

  /**
   * A link to the `/checkout` page without sign-in (synchronous, offline-safe).
   * Suits nags, READMEs and "Sponsor" links. Checkout started this way can't be detected.
   */
  checkoutUrl(options: CheckoutOptions = {}): string {
    // Throws invalid_config for an unconfigured provider or an invalid amount, currency or frequency (PROTOCOL §7.1 item 16).
    return `${this.apiBaseUrl}/checkout?${this.checkoutQuery(options)}`;
  }

  /** Deletes the session token and cache locally (there is no server-side sign-out). Keeps nag state. */
  async signOut(): Promise<void> {
    if (this.disabled) return;
    if (this.mockState) {
      this.mockState = { signedIn: false, contributions: [] };
      return;
    }
    await this.updateStorage((s) => (s.sessionToken || s.cache ? { v: 1, nags: s.nags } : null));
  }

  /** A nag helper (SPEC §7.5). */
  nag(options: NagOptions): Nag {
    if (!options || typeof options !== "object" || typeof options.id !== "string" || options.id === "")
      throw new SponsorkitError("invalid_config", "nag id is required");
    const every = options.every;
    if (typeof every !== "number" || !Number.isFinite(every) || every < 0) throw new SponsorkitError("invalid_config", "nag every must be a number");
    const orEveryMs = options.orEvery === undefined ? null : durationMs(options.orEvery);
    const id = options.id;
    return {
      due: (predicate, dueOptions) => this.nagDue(id, every, orEveryMs, predicate, dueOptions?.force ?? false),
      shown: () => this.nagShown(id),
    };
  }

  // ---------------------------------------------------------------- internals

  /** The storage key (`targets_hash`). */
  protected hash(): Promise<string> {
    this.hashPromise ??= targetsHash(this.targetsParam);
    return this.hashPromise;
  }

  protected store(): Store {
    if (!this.storeInstance) {
      const opt = this.storageOption;
      let storage: SponsorkitStorage;
      if (!opt) storage = this.defaultStorage();
      else if ("read" in opt && "write" in opt) storage = opt;
      else {
        const web = opt as WebStorageLike;
        storage = {
          read: (h) => web.getItem(`sponsorkit:${h}`),
          write: (h, json) => web.setItem(`sponsorkit:${h}`, json),
        };
      }
      this.storeInstance = new Store(storage, opt ? (opt as object) : this.storageLockKey(storage));
    }
    return this.storeInstance;
  }

  protected async readStorage(): Promise<StorageFile> {
    try {
      return await this.store().read(await this.hash());
    } catch {
      return { v: 1 };
    }
  }

  protected async updateStorage(fn: (s: StorageFile) => StorageFile | null): Promise<void> {
    try {
      await this.store().update(await this.hash(), fn);
    } catch {
      // Storage failures never break the host app; the next run re-fetches.
    }
  }

  private get memoKey(): string {
    return `${this.apiBaseUrl}|${this.targetsParam}`;
  }

  /** Dev-time target existence check: once per process, on the first async call. */
  protected async devCheck(): Promise<void> {
    if (!this.devChecks || this.disabled || this.mockState) return;
    let p = processState.devChecks.get(this.memoKey);
    if (!p) {
      p = (async () => {
        const query = new URLSearchParams(this.targetList.map((t) => [t.provider, t.account]));
        const infos = await fetchTargets(this.fetchFn, this.apiBaseUrl, query);
        if (!infos) return; // offline or API error: skip the check
        const missing = infos.filter((t) => t && t.exists === false).map((t) => t.target);
        if (missing.length) {
          throw new SponsorkitError(
            "invalid_config",
            `Sponsorkit target(s) ${missing.join(", ")} do not exist or have no sponsorship listing (dev-time check)`,
          );
        }
      })();
      processState.devChecks.set(this.memoKey, p);
    }
    await p;
  }

  protected emptyResult(over: Partial<ContributionResult>): ContributionResult {
    return {
      signedIn: false,
      disabled: false,
      mock: false,
      targets: [...this.targets],
      supporter: null,
      contributions: [],
      fetchedAt: null,
      stale: false,
      fromCache: false,
      ...over,
    };
  }

  /** Cache-aware refresh implementing the error contract (SPEC §7.2, PROTOCOL §7.1). */
  protected async refresh(cacheTtlSeconds: number): Promise<ContributionResult> {
    const stored = await this.readStorage();
    const token = stored.sessionToken;
    if (!token) return this.emptyResult({});
    const cache = stored.cache ?? null;
    const now = this.now();
    const ttl = cacheTtlSeconds * 1000;
    if (cache && ttl > 0 && now - Date.parse(cache.storedAt) < ttl) return { ...cache.result, fromCache: true };
    const fallback = (): ContributionResult => (cache ? { ...cache.result, fromCache: true, stale: true } : this.emptyResult({ signedIn: true, stale: true }));
    if ((processState.retryUntil.get(this.memoKey) ?? 0) > now) return fallback();

    const res = await fetchContributions(this.fetchFn, this.apiBaseUrl, token, now);
    switch (res.kind) {
      case "session_invalid":
        await this.updateStorage((s) => (s.sessionToken === token ? { v: 1, nags: s.nags } : null));
        return this.emptyResult({});
      case "rate_limited":
        processState.retryUntil.set(this.memoKey, this.now() + res.retryAfterMs);
        return fallback();
      case "failed":
        return fallback();
    }
    let result: ContributionResult = { ...res.result, fromCache: false };
    const unavailable = result.unavailable ?? [];
    if (unavailable.length) {
      result.stale = true;
      if (cache) {
        const have = new Set(result.contributions.map((c) => c.id));
        const cached = cache.result.contributions.filter((c) => unavailable.includes(c.provider) && !have.has(c.id));
        result = { ...result, contributions: [...result.contributions, ...cached] };
      }
    }
    const renewed = res.renewedToken;
    const storedAt = new Date(this.now()).toISOString();
    await this.updateStorage((s) => {
      // Another instance may have signed out or replaced the session meanwhile.
      if (s.sessionToken !== token && s.sessionToken !== renewed) return null;
      return { ...s, sessionToken: renewed ?? s.sessionToken, cache: { result, storedAt } };
    });
    return result;
  }

  /**
   * `POST /api/v1/auth/token`; stores the token and caches the result (PROTOCOL §7.1).
   * Throws `invalid_code` for `400 invalid_code` and `network_error` for anything else that isn't a success.
   */
  protected async exchange(code: string, verifier: string): Promise<ContributionResult> {
    const stored = await this.readStorage();
    const post = async (sessionToken: string | undefined) => {
      try {
        return await this.fetchFn(`${this.apiBaseUrl}/api/v1/auth/token`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ code, codeVerifier: verifier, ...(sessionToken ? { sessionToken } : {}) }),
        });
      } catch (cause) {
        throw new SponsorkitError("network_error", "Could not reach Sponsorkit to complete sign-in", { cause });
      }
    };
    let res = await post(stored.sessionToken ?? undefined);
    if (res.status === 401 && stored.sessionToken) {
      // PROTOCOL §7: adding an identity to a dead session clears it and retries the (reusable) code once without it.
      await res.body?.cancel().catch(() => undefined);
      await this.updateStorage((s) => ({ v: 1, nags: s.nags }));
      res = await post(undefined);
    }
    if (!res.ok) {
      const retryAfter = retryAfterSeconds(res.headers.get("retry-after"), this.now());
      const pc = await problemCode(res);
      if (res.status === 400 && pc === "invalid_code") throw new SponsorkitError("invalid_code", "Sponsorkit rejected the sign-in code");
      throw new SponsorkitError("network_error", `Sign-in code exchange failed (HTTP ${res.status}${pc ? ` ${pc}` : ""})`, { retryAfter });
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (cause) {
      throw new SponsorkitError("network_error", "Malformed sign-in response", { cause });
    }
    if (!isObject(body) || typeof body.sessionToken !== "string" || !isObject(body.result)) {
      throw new SponsorkitError("network_error", "Malformed sign-in response");
    }
    const sessionToken = body.sessionToken;
    const result = { ...(body.result as unknown as ContributionResult), fromCache: false };
    const storedAt = new Date(this.now()).toISOString();
    await this.updateStorage((s) => ({ ...s, sessionToken, cache: { result, storedAt } }));
    return result;
  }

  private async pollForContribution(baseline: ContributionResult, deadline: number, intervalMs: number, signal: AbortSignal): Promise<CheckoutResult> {
    const before = new Map(baseline.contributions.map((c) => [c.id, stableStringify(c)]));
    while (!signal.aborted) {
      const r = await this.refresh(0);
      if (signal.aborted) break;
      const changed: Contribution | undefined = r.contributions.find((c) => before.get(c.id) !== stableStringify(c));
      if (changed) return { status: "contributed", contribution: changed };
      const wait = Math.min(intervalMs, deadline - Date.now());
      if (wait <= 0) break;
      await sleep(wait, signal);
    }
    return { status: "unknown" };
  }

  /** Validated `/checkout` query (without sign-in params). */
  protected checkoutQuery(options: CheckoutOptions): URLSearchParams {
    if (!options || typeof options !== "object") throw new SponsorkitError("invalid_config", "Invalid checkout options");
    const q = new URLSearchParams({ targets: this.targetsParam });
    const { provider, amount, currency, frequency } = options;
    if (provider !== undefined) {
      if (!this.targetList.some((t) => t.provider === provider)) throw new SponsorkitError("invalid_config", `No ${String(provider)} target is configured`);
      q.set("provider", provider);
    }
    if (amount !== undefined) {
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
        throw new SponsorkitError("invalid_config", "amount must be a positive integer in minor units");
      }
      q.set("amount", String(amount));
    }
    if (currency !== undefined) {
      if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency)) throw new SponsorkitError("invalid_config", "currency must be an ISO 4217 code");
      q.set("currency", currency.toUpperCase());
    }
    if (frequency !== undefined) {
      if (!FREQUENCIES.includes(frequency)) throw new SponsorkitError("invalid_config", `frequency must be one of ${FREQUENCIES.join(", ")}`);
      q.set("frequency", frequency);
    }
    return q;
  }

  private interactive(): boolean {
    return this.interactiveOverride ?? this.detectInteractive();
  }

  private async nagDue(id: string, every: number, orEveryMs: number | null, predicate: NagPredicate | undefined, force: boolean): Promise<boolean> {
    if (this.disabled) return false;
    const hash = await this.hash();
    const countKey = `${hash}:${id}`;
    if (this.mockState) {
      // PROTOCOL §7.1 item 14: mock nag state lives in memory, per instance.
      if (!this.mockNagCounted.has(id)) {
        this.mockNagCounted.add(id);
        const prev = this.mockNags[id] ?? { runs: 0, lastShown: null };
        this.mockNags[id] = { ...prev, runs: prev.runs + 1 };
      }
    } else if (!processState.nagCounted.has(countKey)) {
      processState.nagCounted.add(countKey);
      await this.updateStorage((s) => {
        const prev = s.nags?.[id] ?? { runs: 0, lastShown: null };
        return { ...s, nags: { ...s.nags, [id]: { ...prev, runs: prev.runs + 1 } } };
      });
    }
    if (!force) {
      if (isEnvSet(this.env.SPONSORKIT_NO_NAG) || isEnvSet(this.env.CI)) return false;
      if (!this.interactive()) return false;
    }
    if (predicate) {
      const fc = await this.getFinancialContribution();
      if (!(await predicate(fc))) return false;
    }
    const state = this.mockState
      ? (this.mockNags[id] ?? { runs: 0, lastShown: null })
      : ((await this.readStorage()).nags?.[id] ?? { runs: 0, lastShown: null });
    if (state.runs >= every) return true;
    if (orEveryMs !== null && state.lastShown) return this.now() - Date.parse(state.lastShown) >= orEveryMs;
    return false;
  }

  private async nagShown(id: string): Promise<void> {
    if (this.disabled) return;
    const entry: NagState = { runs: 0, lastShown: new Date(this.now()).toISOString() };
    if (this.mockState) {
      this.mockNags[id] = entry;
      return;
    }
    await this.updateStorage((s) => ({ ...s, nags: { ...s.nags, [id]: entry } }));
  }
}

export { FinancialContribution };
