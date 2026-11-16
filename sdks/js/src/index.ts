/**
 * `@sponsorkit/sdk`: the isomorphic Sponsorkit client for browsers (popup or
 * redirect sign-in, `localStorage`). Native apps use `@sponsorkit/sdk/node`,
 * backends use `@sponsorkit/sdk/server`.
 *
 * @example
 * ```ts
 * import { Sponsorkit } from "@sponsorkit/sdk";
 * const sk = new Sponsorkit({ github: "octocat", opencollective: "my-collective" });
 * const fc = await sk.getFinancialContribution();
 * button.onclick = () => sk.openCheckout({ frequency: "monthly", amount: 500 });
 * ```
 */
import { type CodeRequest, SponsorkitCore, type SponsorkitCoreOptions } from "./core";
import { SponsorkitError } from "./errors";
import { hasLocalStorage, localStorageAdapter, memoryStorage, type SponsorkitStorage } from "./storage";
import { isObject } from "./util";

/** Options for the browser client. */
export interface SponsorkitOptions extends SponsorkitCoreOptions {
  /**
   * Redirect fallback when the popup is blocked: an https (or localhost) URL of
   * your app to return to with `?sponsorkit_code=…`. Without it, a blocked popup
   * rejects with `popup_blocked`.
   */
  returnTo?: string;
  /** Opens the popup. Must open synchronously. Default: `window.open(url, "sponsorkit", features)`. */
  openWindow?: (url: string) => Window | null;
  /** `window.open` features. Default `"popup,width=520,height=720"`. */
  popupFeatures?: string;
}

/** @internal State of one popup/redirect interaction. */
interface Interaction {
  popup: Window | null;
  redirect: boolean;
}

const LOCAL_STORAGE_LOCK = {};
const PENDING_PREFIX = "sponsorkit:pending:";
const POPUP_POLL_MS = 400;

interface BrowserWindowLike {
  location: { origin: string; href: string; assign(url: string): void };
  open(url: string, target?: string, features?: string): Window | null;
  addEventListener(type: "message", fn: (e: MessageEvent) => void): void;
  removeEventListener(type: "message", fn: (e: MessageEvent) => void): void;
  history?: { replaceState(data: unknown, unused: string, url?: string): void };
  sessionStorage?: Storage;
}

function win(): BrowserWindowLike | null {
  const w = (globalThis as { window?: BrowserWindowLike }).window;
  return w && typeof w.open === "function" ? w : null;
}

function isAllowedReturnTo(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
  } catch {
    return false;
  }
}

const pendingRedirects = new Map<string, Promise<boolean>>();

/**
 * Sponsorkit client for browsers.
 *
 * Call `signIn()` and `openCheckout()` directly from a click handler: they open
 * their popup synchronously, so popup blockers allow it.
 */
export class Sponsorkit extends SponsorkitCore<Interaction> {
  private readonly returnTo: string | undefined;
  private readonly openWindowFn: ((url: string) => Window | null) | undefined;
  private readonly popupFeatures: string;

  /** Throws `SponsorkitError{code: "invalid_config"}` for missing or malformed targets and options. */
  constructor(options: SponsorkitOptions) {
    super(options);
    if (options.returnTo !== undefined && !isAllowedReturnTo(options.returnTo)) {
      throw new SponsorkitError("invalid_config", "returnTo must be an https or http://localhost URL");
    }
    this.returnTo = options.returnTo;
    this.openWindowFn = options.openWindow;
    this.popupFeatures = options.popupFeatures ?? "popup,width=520,height=720";
  }

  protected defaultStorage(): SponsorkitStorage {
    return hasLocalStorage() ? localStorageAdapter() : memoryStorage();
  }

  protected override storageLockKey(storage: SponsorkitStorage): object {
    return hasLocalStorage() ? LOCAL_STORAGE_LOCK : storage;
  }

  protected detectInteractive(): boolean {
    return true;
  }

  private get apiOrigin(): string {
    return this.apiBaseUrl;
  }

  protected beginInteraction(): Interaction {
    const w = win();
    let popup: Window | null = null;
    try {
      popup = this.openWindowFn ? this.openWindowFn("about:blank") : (w?.open("about:blank", "sponsorkit", this.popupFeatures) ?? null);
    } catch {
      popup = null;
    }
    if (popup) return { popup, redirect: false };
    if (this.returnTo && w) return { popup: null, redirect: true };
    throw new SponsorkitError("popup_blocked", "The Sponsorkit popup was blocked; call this from a click handler or set returnTo");
  }

  protected endInteraction(interaction: Interaction): void {
    try {
      if (interaction.popup && !interaction.popup.closed) interaction.popup.close();
    } catch {
      // cross-origin or already gone
    }
  }

  protected async obtainCode(interaction: Interaction, request: CodeRequest): Promise<string> {
    const w = win();
    if (interaction.redirect || !interaction.popup) {
      if (!w || !this.returnTo) throw new SponsorkitError("popup_blocked", "The Sponsorkit popup was blocked");
      if (request.path === "/checkout") {
        // A redirect can't return to the app and continue to checkout; use the anonymous checkout page.
        w.location.assign(request.continueUrl?.replace(/&step=choose$/, "") ?? `${this.apiBaseUrl}/checkout?targets=${encodeURIComponent(this.targetsParam)}`);
        return new Promise<never>(() => {});
      }
      const q = new URLSearchParams(request.params);
      q.set("delivery", "redirect");
      q.set("redirect_uri", this.returnTo);
      try {
        w.sessionStorage?.setItem(`${PENDING_PREFIX}${await this.hash()}`, JSON.stringify({ verifier: request.verifier, returnTo: this.returnTo }));
      } catch {
        throw new SponsorkitError("popup_blocked", "The popup was blocked and sessionStorage is unavailable for the redirect fallback");
      }
      w.location.assign(`${this.apiBaseUrl}${request.path}?${q}`);
      // The page navigates away; sign-in completes on return (see handleRedirectCallback()).
      return new Promise<never>(() => {});
    }
    if (!w) throw new SponsorkitError("popup_blocked", "No window");
    const popup = interaction.popup;
    const q = new URLSearchParams(request.params);
    q.set("delivery", "web_message");
    q.set("origin", w.location.origin);
    const url = `${this.apiBaseUrl}${request.path}?${q}`;
    return new Promise<string>((resolve, reject) => {
      let timer: ReturnType<typeof setInterval> | undefined;
      const cleanup = () => {
        clearInterval(timer);
        w.removeEventListener("message", onMessage);
        request.signal.removeEventListener("abort", onAbort);
      };
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== this.apiOrigin || event.source !== popup) return;
        const data: unknown = event.data;
        if (!isObject(data)) return;
        if (data.type === "sponsorkit:code" && typeof data.code === "string") {
          cleanup();
          resolve(data.code);
        } else if (data.type === "sponsorkit:error") {
          cleanup();
          const e = data.error;
          reject(new SponsorkitError(e === "access_denied" || e === "invalid_state" ? e : "provider_error", `Sign-in failed: ${String(e)}`));
        }
      };
      const onAbort = () => {
        cleanup();
        reject(new SponsorkitError("access_denied", "Sign-in was cancelled"));
      };
      w.addEventListener("message", onMessage);
      request.signal.addEventListener("abort", onAbort, { once: true });
      if (request.signal.aborted) return onAbort();
      timer = setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new SponsorkitError("access_denied", "The sign-in window was closed"));
        }
      }, POPUP_POLL_MS);
      try {
        popup.location.href = url;
      } catch (e) {
        cleanup();
        reject(new SponsorkitError("popup_blocked", "Could not navigate the Sponsorkit popup", { cause: e }));
      }
    });
  }

  protected async showCheckout(interaction: Interaction, url: string): Promise<void> {
    if (interaction.popup) {
      interaction.popup.location.href = url;
      return;
    }
    win()?.location.assign(url);
  }

  protected override async beforePolling(interaction: Interaction, signal: AbortSignal): Promise<void> {
    const popup = interaction.popup;
    if (!popup) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearInterval(timer);
        signal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setInterval(() => popup.closed && done(), POPUP_POLL_MS);
      signal.addEventListener("abort", done, { once: true });
      if (popup.closed || signal.aborted) done();
    });
  }

  protected override async prepare(): Promise<void> {
    await this.handleRedirectCallback().catch(() => false);
  }

  /**
   * Completes a redirect sign-in (popup-blocked fallback) when the current URL
   * carries `sponsorkit_code` or `sponsorkit_error`, and removes them from the
   * address bar. Runs automatically before other calls; call it yourself to
   * observe errors. Resolves `true` if a sign-in was completed.
   */
  handleRedirectCallback(href?: string): Promise<boolean> {
    const w = win();
    if (!w || this.disabled || this.isMock) return Promise.resolve(false);
    const url = new URL(href ?? w.location.href);
    const code = url.searchParams.get("sponsorkit_code");
    const error = url.searchParams.get("sponsorkit_error");
    if (!code && !error) return Promise.resolve(false);
    const key = `${this.targetsParam}|${code ?? error}`;
    let p = pendingRedirects.get(key);
    if (!p) {
      p = (async () => {
        const storageKey = `${PENDING_PREFIX}${await this.hash()}`;
        let pending: { verifier?: unknown } | null = null;
        try {
          pending = JSON.parse(w.sessionStorage?.getItem(storageKey) ?? "null");
          w.sessionStorage?.removeItem(storageKey);
        } catch {
          pending = null;
        }
        if (!pending || typeof pending.verifier !== "string") return false;
        url.searchParams.delete("sponsorkit_code");
        url.searchParams.delete("sponsorkit_error");
        try {
          w.history?.replaceState(null, "", url.href);
        } catch {
          // ignore
        }
        if (error) throw new SponsorkitError(error === "access_denied" || error === "invalid_state" ? error : "provider_error", `Sign-in failed: ${error}`);
        await this.exchange(code as string, pending.verifier);
        return true;
      })();
      pendingRedirects.set(key, p);
    }
    return p;
  }
}

export * from "./shared-exports";
