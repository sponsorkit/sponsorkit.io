/** Thin wrappers over the Sponsorkit HTTP API (PROTOCOL §3). */
import { SponsorkitError } from "./errors";
import type { ContributionResult, TargetInfo } from "./types";
import { isObject } from "./util";

/** A `fetch`-compatible function. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Resolves the fetch implementation at call time (so tests can stub the global). */
export function resolveFetch(custom?: FetchLike): FetchLike {
  return custom ?? ((input, init) => globalThis.fetch(input, init));
}

/** Default per-request timeout in seconds. */
export const DEFAULT_REQUEST_TIMEOUT = 30;

/** Validates a `requestTimeout` option (seconds; `0` disables) and returns milliseconds. */
export function requestTimeoutMs(value: unknown): number {
  const secs = value ?? DEFAULT_REQUEST_TIMEOUT;
  if (typeof secs !== "number" || !Number.isFinite(secs) || secs < 0) {
    throw new SponsorkitError("invalid_config", "requestTimeout must be a non-negative number of seconds");
  }
  return secs * 1000;
}

/**
 * Wraps `fetchFn` so every request is aborted after `timeoutMs` (headers and body),
 * in addition to the caller's own `signal`. `0` returns `fetchFn` unchanged.
 */
export function withTimeout(fetchFn: FetchLike, timeoutMs: number): FetchLike {
  if (!(timeoutMs > 0)) return fetchFn;
  return (input, init) => {
    const ac = new AbortController();
    const outer = init?.signal ?? undefined;
    const onAbort = () => ac.abort(outer?.reason);
    if (outer?.aborted) onAbort();
    else outer?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      outer?.removeEventListener("abort", onAbort);
      ac.abort(new SponsorkitError("network_error", `Request timed out after ${timeoutMs / 1000} s`));
    }, timeoutMs) as unknown as { unref?: () => void };
    // The timer keeps covering the body read; it must not keep the process alive.
    timer.unref?.();
    return fetchFn(input, { ...init, signal: ac.signal });
  };
}

/** Outcome of `GET /api/v1/contributions`. */
export type ContributionsResponse =
  | { kind: "ok"; result: ContributionResult; renewedToken: string | null }
  | { kind: "session_invalid" }
  | { kind: "rate_limited"; retryAfterMs: number; retryAfter: number | undefined }
  | { kind: "failed"; error?: unknown; status?: number; retryAfter?: number };

/** Upper bound for `Retry-After`, in seconds (PROTOCOL §7.0: 24 h). */
export const MAX_RETRY_AFTER = 86_400;

/** A session token as stored and sent: `sks_` followed by printable ASCII (PROTOCOL §7.0). */
export function isSessionToken(v: unknown): v is string {
  return typeof v === "string" && /^sks_[\x21-\x7e]+$/.test(v);
}

/**
 * Parses a `Retry-After` header (delta-seconds or HTTP date) into whole seconds, clamped to
 * {@link MAX_RETRY_AFTER}; `undefined` when absent, malformed or not finite (PROTOCOL §7.0).
 */
export function retryAfterSeconds(header: string | null, now: number): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  let secs: number;
  if (/^\d+$/.test(trimmed)) secs = Number(trimmed);
  else if (/[a-z]/i.test(trimmed)) secs = Math.ceil((Date.parse(trimmed) - now) / 1000);
  else return undefined;
  // An unparseable date is ignored; huge digit strings (which parse to Infinity) and far-off dates are clamped.
  if (Number.isNaN(secs)) return undefined;
  return Math.min(MAX_RETRY_AFTER, Math.max(0, secs));
}

/** Parses `Retry-After` (seconds or HTTP date) into milliseconds; defaults to 60 s. */
export function parseRetryAfter(header: string | null, now: number): number {
  const secs = retryAfterSeconds(header, now);
  return secs === undefined ? 60_000 : secs * 1000;
}

/** Minimal structural check of a ContributionResult. */
export function isContributionResult(v: unknown): v is ContributionResult {
  return (
    isObject(v) &&
    typeof v.signedIn === "boolean" &&
    Array.isArray(v.targets) &&
    Array.isArray(v.contributions) &&
    (v.supporter === null || isObject(v.supporter))
  );
}

/** `GET /api/v1/contributions` with a bearer session token. Never throws. */
export async function fetchContributions(
  fetchFn: FetchLike,
  baseUrl: string,
  token: string,
  now: number,
  signal?: AbortSignal,
): Promise<ContributionsResponse> {
  let res: Response;
  try {
    res = await fetchFn(`${baseUrl}/api/v1/contributions`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal,
    });
  } catch (error) {
    return { kind: "failed", error };
  }
  if (res.status === 401) {
    await res.body?.cancel().catch(() => undefined);
    return { kind: "session_invalid" };
  }
  if (res.status === 429) {
    await res.body?.cancel().catch(() => undefined);
    const header = res.headers.get("retry-after");
    return { kind: "rate_limited", retryAfterMs: parseRetryAfter(header, now), retryAfter: retryAfterSeconds(header, now) };
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    return { kind: "failed", status: res.status, retryAfter: retryAfterSeconds(res.headers.get("retry-after"), now) };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch (error) {
    return { kind: "failed", error };
  }
  if (!isContributionResult(body)) return { kind: "failed", status: res.status };
  const renewed = res.headers.get("sponsorkit-session");
  return { kind: "ok", result: body, renewedToken: isSessionToken(renewed) ? renewed : null };
}

/** `GET /api/v1/targets`. Returns `null` on any failure. */
export async function fetchTargets(fetchFn: FetchLike, baseUrl: string, query: URLSearchParams): Promise<TargetInfo[] | null> {
  try {
    const res = await fetchFn(`${baseUrl}/api/v1/targets?${query}`, { headers: { accept: "application/json" } });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const body = (await res.json()) as unknown;
    if (!isObject(body) || !Array.isArray(body.targets)) return null;
    return body.targets as TargetInfo[];
  } catch {
    return null;
  }
}

/** Reads the problem+json `code` of an error response, if any. */
export async function problemCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as unknown;
    return isObject(body) && typeof body.code === "string" ? body.code : undefined;
  } catch {
    return undefined;
  }
}
