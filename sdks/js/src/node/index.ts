/**
 * `@sponsorkit/sdk/node`: the Sponsorkit client for Node.js, Bun and Deno
 * (CLIs, desktop apps, servers acting for one user). Sign-in uses a loopback
 * redirect to the system browser, or paste-back when headless; state lives in
 * the per-user config directory.
 *
 * @example
 * ```ts
 * import { Sponsorkit } from "@sponsorkit/sdk/node";
 * const sk = new Sponsorkit({ github: "octocat", appName: "my-cli" });
 * const fc = await sk.getFinancialContribution();
 * ```
 */
import { createInterface } from "node:readline";
import { abortError, type CodeRequest, type OpenCheckoutOptions, type SignInOptions, SponsorkitCore, type SponsorkitCoreOptions } from "../core";
import { SponsorkitError } from "../errors";
import type { FinancialContribution } from "../result";
import { memoryStorage, type SponsorkitStorage } from "../storage";
import type { CheckoutResult } from "../types";
import { isEnvSet } from "../util";
import { openSystemBrowser } from "./browser";
import { startLoopbackReceiver } from "./loopback";
import { defaultStorageDir, fileStorage } from "./storage";

/** How native sign-in delivers the code. */
export type SignInMethod = "auto" | "loopback" | "paste";

/** Options for the native client. */
export interface SponsorkitOptions extends SponsorkitCoreOptions {
  /** Shown on the consent page as "says it is" (max 64 characters). */
  appName?: string;
  /** Directory for the storage files. Default: the per-user config directory (see `defaultStorageDir()`). Ignored when `storage` is given. */
  storageDir?: string;
  /** `auto` (default) tries loopback and falls back to paste-back when headless, over SSH, when the browser can't be opened, or when the loopback receiver can't bind. */
  signInMethod?: SignInMethod;
  /** Opens a URL in a browser. Default: the system browser (`open` / `xdg-open` / `rundll32`), without a shell. */
  openBrowser?: (url: string) => void | Promise<void>;
  /** Asks the user for the paste-back code; receives the URL to open. Default: prints to stderr and reads a line from stdin. */
  promptForCode?: (url: string) => string | Promise<string>;
  /** Where to print messages for the user. Default: `process.stderr`. */
  output?: { write(text: string): unknown };
}

/** Native `signIn()` options. */
export interface NodeSignInOptions extends SignInOptions {
  /** Forces the delivery method for this call (overrides `signInMethod`). */
  method?: SignInMethod;
}

/** Native `openCheckout()` options. */
export interface NodeOpenCheckoutOptions extends OpenCheckoutOptions {
  /** Forces the sign-in method if a sign-in is needed (overrides `signInMethod`). */
  method?: SignInMethod;
}

const APP_NAME_MAX = 64;

function stdinPrompt(output: { write(text: string): unknown }, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", onAbort);
      rl.close();
      fn();
    };
    const onAbort = () => finish(() => reject(abortError(signal)));
    signal.addEventListener("abort", onAbort, { once: true });
    output.write("Paste the code here: ");
    rl.once("line", (line) => finish(() => resolve(line)));
    rl.once("close", () => finish(() => reject(new SponsorkitError("cancelled", "No sign-in code was entered"))));
  });
}

/**
 * Sponsorkit client for native runtimes.
 *
 * @example
 * ```ts
 * const sk = new Sponsorkit({ github: "octocat", opencollective: "my-collective", appName: "my-cli" });
 * if (!(await sk.isSignedIn())) await sk.signIn();
 * const fc = await sk.getFinancialContribution();
 * if (fc.active().length === 0) console.error(`Support my-cli: ${sk.checkoutUrl({ frequency: "monthly" })}`);
 * ```
 */
export class Sponsorkit extends SponsorkitCore<null> {
  /** The `appName` sent to the consent page, if any. */
  readonly appName: string | undefined;
  private readonly storageDir: string | undefined;
  private readonly signInMethod: SignInMethod;
  private readonly openBrowserFn: (url: string) => void | Promise<void>;
  private readonly promptFn: ((url: string) => string | Promise<string>) | undefined;
  private readonly output: { write(text: string): unknown };

  /** Throws `SponsorkitError{code: "invalid_config"}` for missing or malformed targets and options. */
  constructor(options: SponsorkitOptions) {
    super(options);
    if (options.appName !== undefined && (typeof options.appName !== "string" || options.appName.length > APP_NAME_MAX)) {
      throw new SponsorkitError("invalid_config", `appName must be a string of at most ${APP_NAME_MAX} characters`);
    }
    const method = options.signInMethod ?? "auto";
    if (method !== "auto" && method !== "loopback" && method !== "paste") throw new SponsorkitError("invalid_config", `Invalid signInMethod "${method}"`);
    this.appName = options.appName || undefined;
    this.storageDir = options.storageDir;
    this.signInMethod = method;
    this.openBrowserFn = options.openBrowser ?? openSystemBrowser;
    this.promptFn = options.promptForCode;
    this.output = options.output ?? process.stderr;
  }

  /** Signs in (see the base class); `method` forces the delivery method for this call. */
  override signIn(options: NodeSignInOptions = {}): Promise<FinancialContribution> {
    return super.signIn(options);
  }

  /** Opens checkout (see the base class); `method` forces the sign-in method if a sign-in is needed. */
  override openCheckout(options: NodeOpenCheckoutOptions = {}): Promise<CheckoutResult> {
    return super.openCheckout(options);
  }

  /** `storageDir`, else the per-user config directory, else (no home directory) in-memory storage. Never the cwd. */
  protected defaultStorage(): SponsorkitStorage {
    const dir = this.storageDir ?? defaultStorageDir();
    return dir ? fileStorage(dir) : memoryStorage();
  }

  protected beginInteraction(): null {
    return null;
  }

  protected endInteraction(): void {}

  protected detectInteractive(): boolean {
    return !!process.stdout?.isTTY && !!process.stderr?.isTTY;
  }

  private resolveMethod(request: CodeRequest): "loopback" | "paste" | "auto" {
    const m = (request.method as SignInMethod | undefined) ?? this.signInMethod;
    if (m !== "auto") return m;
    const env = process.env;
    if (isEnvSet(env.SSH_CONNECTION) || isEnvSet(env.SSH_TTY)) return "paste";
    if (process.platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY) return "paste";
    return "auto";
  }

  protected async obtainCode(_: null, request: CodeRequest): Promise<string> {
    const method = this.resolveMethod(request);
    if (method === "paste") return this.pasteFlow(request);
    const loopback = await this.loopbackFlow(request, method === "auto");
    return loopback ?? this.pasteFlow(request);
  }

  private buildUrl(request: CodeRequest, delivery: Record<string, string>): string {
    const q = new URLSearchParams(request.params);
    for (const [k, v] of Object.entries(delivery)) q.set(k, v);
    if (this.appName) q.set("app_name", this.appName);
    return this.pageUrl(request.path, q);
  }

  /** Returns the code, or `null` to fall back to paste-back (auto mode, browser could not be opened or the receiver could not bind). */
  private async loopbackFlow(request: CodeRequest, allowFallback: boolean): Promise<string | null> {
    let receiver: Awaited<ReturnType<typeof startLoopbackReceiver>>;
    try {
      receiver = await startLoopbackReceiver(request.continueUrl);
    } catch (cause) {
      // e.g. EADDRNOTAVAIL / EACCES on 127.0.0.1 in a sandbox: paste-back still works.
      if (allowFallback) return null;
      throw new SponsorkitError("provider_error", "Could not start the loopback sign-in receiver on 127.0.0.1", { cause });
    }
    try {
      const url = this.buildUrl(request, { delivery: "loopback", redirect_uri: receiver.redirectUri });
      // request.signal aborts on cancellation (`cancelled`) or signInTimeout (`timeout`).
      const outcome = raceAbort(receiver.result, request.signal);
      outcome.catch(() => undefined);
      // PROTOCOL §7.0: the callback is accepted while the opener is still running.
      const opening = Promise.resolve()
        .then(() => this.openBrowserFn(url))
        .then(
          () => ({ kind: "opened" as const }),
          () => ({ kind: "failed" as const }),
        );
      const first = await Promise.race([outcome.then((r) => ({ kind: "result" as const, r })), opening]);
      if (first.kind === "failed") {
        if (allowFallback) return null;
        this.output.write(`Open this URL in your browser to sign in:\n\n  ${url}\n\n`);
      }
      const r = first.kind === "result" ? first.r : await outcome;
      if ("error" in r) throw new SponsorkitError(signInErrorCode(r.error), `Sign-in failed: ${r.error}`);
      return r.code;
    } finally {
      void receiver.close();
    }
  }

  private async pasteFlow(request: CodeRequest): Promise<string> {
    const url = this.buildUrl(request, { delivery: "paste" });
    this.output.write(`To sign in, open this URL in a browser on any device:\n\n  ${url}\n\nThen paste the code shown on the page (valid for 10 minutes).\n`);
    const code = (await raceAbort(Promise.resolve(this.promptFn ? this.promptFn(url) : stdinPrompt(this.output, request.signal)), request.signal)).trim();
    if (!code) throw new SponsorkitError("cancelled", "No sign-in code was entered");
    return code;
  }

  protected async showCheckout(_: null, url: string): Promise<void> {
    try {
      await this.openBrowserFn(url);
    } catch {
      this.output.write(`Open this URL in your browser to contribute:\n\n  ${url}\n\n`);
    }
  }
}

/** Settles like `promise`, or rejects with {@link abortError} once `signal` aborts. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

function signInErrorCode(error: string): "access_denied" | "invalid_state" | "provider_error" {
  return error === "access_denied" || error === "invalid_state" ? error : "provider_error";
}

export * from "../shared-exports";
export { browserCommand, openSystemBrowser } from "./browser";
export { defaultStorageDir, fileStorage } from "./storage";
