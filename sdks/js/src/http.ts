/** Thin wrappers over the Sponsorkit HTTP API (PROTOCOL §3). */
import type { ContributionResult, TargetInfo } from "./types";
import { isObject } from "./util";

/** A `fetch`-compatible function. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Resolves the fetch implementation at call time (so tests can stub the global). */
export function resolveFetch(custom?: FetchLike): FetchLike {
  return custom ?? ((input, init) => globalThis.fetch(input, init));
}

/** Outcome of `GET /api/v1/contributions`. */
export type ContributionsResponse =
  | { kind: "ok"; result: ContributionResult; renewedToken: string | null }
  | { kind: "session_invalid" }
  | { kind: "rate_limited"; retryAfterMs: number }
  | { kind: "failed"; error?: unknown; status?: number };

/** Parses `Retry-After` (seconds or HTTP date) into milliseconds; defaults to 60 s. */
export function parseRetryAfter(header: string | null, now: number): number {
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, date - now);
  }
  return 60_000;
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
    return { kind: "rate_limited", retryAfterMs: parseRetryAfter(res.headers.get("retry-after"), now) };
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    return { kind: "failed", status: res.status };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch (error) {
    return { kind: "failed", error };
  }
  if (!isContributionResult(body)) return { kind: "failed", status: res.status };
  const renewed = res.headers.get("sponsorkit-session");
  return { kind: "ok", result: body, renewedToken: renewed?.startsWith("sks_") ? renewed : null };
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
