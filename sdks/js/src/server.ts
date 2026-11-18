/**
 * `@sponsorkit/sdk/server`: backend verification (SPEC §6.4). Works in Node,
 * Bun, Deno, Cloudflare Workers and browsers; touches no storage.
 *
 * @example
 * ```ts
 * import { verifySession } from "@sponsorkit/sdk/server";
 * const fc = await verifySession(tokenFromFrontend, { github: "octocat" });
 * if (fc.active().length > 0) unlockPremium();
 * ```
 */
import { SponsorkitError } from "./errors";
import { type FetchLike, fetchContributions, requestTimeoutMs, resolveFetch, withTimeout } from "./http";
import { FinancialContribution } from "./result";
import { targetsFrom, targetsParam } from "./targets";
import type { TargetOptions } from "./types";
import { DEFAULT_API_BASE_URL, normalizeBaseUrl } from "./util";

/** Options for {@link verifySession}. */
export interface VerifySessionOptions {
  /** API origin. Default `https://api.sponsorkit.io`; an empty string counts as unset. */
  apiBaseUrl?: string;
  /** Custom `fetch`. */
  fetch?: FetchLike;
  /** Aborts the request. */
  signal?: AbortSignal;
  /** Seconds before the request is abandoned with `network_error`. Default 30; `0` disables the limit. */
  requestTimeout?: number;
}

/**
 * Verifies a supporter's session token (`sks_…`) forwarded by your frontend and
 * returns their live contributions for `targets`.
 *
 * Throws `SponsorkitError` with code:
 * - `invalid_config`: `targets` is missing or malformed;
 * - `session_invalid`: the token is missing, malformed, expired or rejected;
 * - `targets_mismatch`: the session was issued for a different target set;
 * - `network_error`: Sponsorkit could not be reached, answered 5xx or 429, or sent an unexpected response.
 *   `retryAfter` holds the seconds from `Retry-After` when the API sent one (e.g. on 429).
 *
 * @param targets `{ github?, opencollective? }`, a canonical target param, or a list of target strings.
 */
export async function verifySession(
  token: string,
  targets: TargetOptions | string | readonly string[],
  options: VerifySessionOptions = {},
): Promise<FinancialContribution> {
  const expected = targetsParam(targetsFrom(targets));
  const baseUrl = normalizeBaseUrl(options.apiBaseUrl || DEFAULT_API_BASE_URL);
  const timeoutMs = requestTimeoutMs(options.requestTimeout);
  if (typeof token !== "string" || !token.trim()) throw new SponsorkitError("session_invalid", "No session token");
  const res = await fetchContributions(withTimeout(resolveFetch(options.fetch), timeoutMs), baseUrl, token.trim(), Date.now(), options.signal);
  switch (res.kind) {
    case "session_invalid":
      throw new SponsorkitError("session_invalid", "The session token is invalid or expired");
    case "rate_limited":
      throw new SponsorkitError("network_error", "Sponsorkit rate limited this session", { retryAfter: res.retryAfter });
    case "failed":
      throw new SponsorkitError("network_error", `Sponsorkit could not be reached${res.status ? ` (HTTP ${res.status})` : ""}`, {
        cause: res.error,
        retryAfter: res.retryAfter,
      });
  }
  let actual: string;
  try {
    actual = targetsParam(targetsFrom(res.result.targets));
  } catch {
    throw new SponsorkitError("targets_mismatch", "The session's targets are malformed");
  }
  if (actual !== expected) throw new SponsorkitError("targets_mismatch", `The session is for ${actual}, expected ${expected}`);
  return new FinancialContribution({ ...res.result, fromCache: false });
}

export { isSponsorkitError, SPONSORKIT_ERROR_CODES, SponsorkitError, type SponsorkitErrorCode } from "./errors";
export type { FetchLike } from "./http";
export { FinancialContribution } from "./result";
export * from "./types";
