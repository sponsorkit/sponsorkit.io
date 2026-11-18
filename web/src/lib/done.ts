/**
 * `/connect/done/` fragment handling (PROTOCOL §4.5). Pure: the page passes `location.hash`.
 */
import { CODE_PREFIX } from "@sponsorkit/shared";
import { isValidOrigin } from "./params";
import { BASE_PATH, SITE_PATHS, sitePath } from "./site";

export type DoneState =
  | { kind: "code"; code: string; origin: string; continueQuery: string | null }
  | { kind: "paste"; code: string; continueQuery: string | null }
  | { kind: "error"; error: string; origin: string | null }
  | { kind: "invalid"; reason: string }
  | { kind: "empty" };

const CODE = new RegExp(`^${CODE_PREFIX}[A-Za-z0-9_-]{16,4096}$`);
const ERROR_CODE = /^[a-z_]{1,64}$/;

export function isValidCode(code: string): boolean {
  return CODE.test(code);
}

/**
 * Validates a `continue` value: a query string for `/checkout/`. Returns it normalized, or null.
 * Never yields anything that can leave `/checkout/` on this site.
 */
export function normalizeContinue(raw: string | null): string | null {
  if (raw === null) return null;
  const v = raw.startsWith("?") ? raw.slice(1) : raw;
  if (v === "" || v.includes("#")) return null;
  const q = new URLSearchParams(v);
  if (!q.get("targets")) return null;
  // step is appended by checkoutContinueHref; sign-in params must never ride along.
  for (const k of ["step", "challenge", "delivery", "origin", "redirect_uri"]) q.delete(k);
  return q.toString();
}

/** Site page `/checkout/?<continue>&step=choose` under the base path (PROTOCOL §4.5). */
export function checkoutContinueHref(continueQuery: string, basePath: string = BASE_PATH): string {
  return `${sitePath(SITE_PATHS.checkout, basePath)}?${continueQuery}&step=choose`;
}

export function parseDoneHash(hash: string): DoneState {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw === "") return { kind: "empty" };
  const h = new URLSearchParams(raw);
  const continueQuery = normalizeContinue(h.get("continue"));

  const error = h.get("error");
  if (error !== null) {
    const o = h.get("origin");
    return {
      kind: "error",
      error: ERROR_CODE.test(error) ? error : "provider_error",
      origin: o && isValidOrigin(o) ? o : null,
    };
  }

  const paste = h.get("paste");
  if (paste !== null) {
    if (!isValidCode(paste)) return { kind: "invalid", reason: "The sign-in code in this link is malformed." };
    return { kind: "paste", code: paste, continueQuery };
  }

  const code = h.get("code");
  if (code !== null) {
    if (!isValidCode(code)) return { kind: "invalid", reason: "The sign-in code in this link is malformed." };
    const origin = h.get("origin");
    if (!origin || !isValidOrigin(origin)) return { kind: "invalid", reason: "The app origin in this link is missing or malformed." };
    return { kind: "code", code, origin, continueQuery };
  }

  return { kind: "empty" };
}

export const ERROR_MESSAGES: Record<string, { title: string; body: string }> = {
  access_denied: {
    title: "Sign-in cancelled",
    body: "You didn't grant access, so nothing was shared. You can close this window, or start again from the app.",
  },
  invalid_state: {
    title: "This sign-in link expired",
    body: "Sign-in links are valid for 10 minutes and work once. Start again from the app.",
  },
  provider_error: {
    title: "The provider returned an error",
    body: "GitHub or Open Collective couldn't complete the sign-in. Please try again in a moment.",
  },
};

export function errorMessage(code: string): { title: string; body: string } {
  return ERROR_MESSAGES[code] ?? { title: "Sign-in failed", body: "Something went wrong. Start again from the app." };
}
