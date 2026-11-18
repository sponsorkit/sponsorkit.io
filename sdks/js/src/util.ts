/** Small internal helpers. */
import { SponsorkitError } from "./errors";

/** The default API origin (PROTOCOL §0): where every `/api/v1/…` call goes. */
export const DEFAULT_API_BASE_URL = "https://api.sponsorkit.io";
/** The default site base URL (PROTOCOL §0): origin plus base path of the pages (`/connect/`, `/checkout/`). */
export const DEFAULT_SITE_BASE_URL = "https://sponsorkit.github.io/sponsorkit.io";

/** An environment map (`process.env`-shaped). */
export type Env = Record<string, string | undefined>;

/** PROTOCOL §7: a variable is set when it is non-empty and not `0` or `false` (case-insensitive). */
export function isEnvSet(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false";
}

/** The host process environment, if there is one (Node, Bun, Deno with compat, bundlers that inline it). */
export function processEnv(): Env {
  const p = (globalThis as { process?: { env?: Env } }).process;
  return p?.env ?? {};
}

/** Parses an ISO-8601 duration (`P7D`, `PT2S`, `P1W`, `P1DT12H`) or a number of seconds into milliseconds. */
export function durationMs(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new SponsorkitError("invalid_config", `Invalid duration ${value}`);
    return value * 1000;
  }
  const m =
    /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
      value.trim().toUpperCase(),
    );
  if (!m || /^P$|T$/.test(value.trim().toUpperCase())) throw new SponsorkitError("invalid_config", `Invalid ISO-8601 duration "${value}"`);
  const [, y, mo, w, d, h, mi, s] = m.map((x) => (x === undefined ? 0 : Number(x)));
  const days = (y ?? 0) * 365 + (mo ?? 0) * 30 + (w ?? 0) * 7 + (d ?? 0);
  return ((days * 24 + (h ?? 0)) * 3600 + (mi ?? 0) * 60 + (s ?? 0)) * 1000;
}

/** Sleeps for `ms`, resolving early (not rejecting) when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted || ms <= 0) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** JSON with sorted object keys, for content comparison. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function parseHttpUrl(url: string, name: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new SponsorkitError("invalid_config", `Invalid ${name} "${url}"`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new SponsorkitError("invalid_config", `${name} must be http(s): "${url}"`);
  return u;
}

/** Validates and normalizes an API origin (`https://api.sponsorkit.io`). */
export function normalizeBaseUrl(url: string): string {
  return parseHttpUrl(url, "apiBaseUrl").origin;
}

/**
 * Validates and normalizes a site base URL: an origin plus an optional base path
 * (`https://sponsorkit.github.io/sponsorkit.io`), without trailing slashes, query or fragment.
 */
export function normalizeSiteBaseUrl(url: string): string {
  const u = parseHttpUrl(url, "siteBaseUrl");
  if (u.search || u.hash || u.username || u.password)
    throw new SponsorkitError("invalid_config", `siteBaseUrl must be an origin plus an optional path: "${url}"`);
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

/** Normalized API and site base URLs. */
export interface BaseUrls {
  /** API origin, no trailing slash. */
  apiBaseUrl: string;
  /** Site base URL (origin plus optional base path), no trailing slash. */
  siteBaseUrl: string;
}

/**
 * PROTOCOL §7 base URL rule: `apiBaseUrl` defaults to {@link DEFAULT_API_BASE_URL}; `siteBaseUrl`
 * defaults to `apiBaseUrl` when that was set (single-origin self-hosting, tests), else to
 * {@link DEFAULT_SITE_BASE_URL}. Empty strings count as unset; trailing slashes are trimmed.
 */
export function resolveBaseUrls(options: { apiBaseUrl?: string | null; siteBaseUrl?: string | null }): BaseUrls {
  const api = options.apiBaseUrl || undefined;
  const site = options.siteBaseUrl || undefined;
  if (api !== undefined && typeof api !== "string") throw new SponsorkitError("invalid_config", "apiBaseUrl must be a string");
  if (site !== undefined && typeof site !== "string") throw new SponsorkitError("invalid_config", "siteBaseUrl must be a string");
  return {
    apiBaseUrl: normalizeBaseUrl(api ?? DEFAULT_API_BASE_URL),
    siteBaseUrl: normalizeSiteBaseUrl(site ?? api ?? DEFAULT_SITE_BASE_URL),
  };
}

/** Page paths on the site (PROTOCOL §4): always the trailing-slash form. */
export const SITE_PATHS = { connect: "/connect/", checkout: "/checkout/" } as const;

/** A site page path. */
export type SitePath = (typeof SITE_PATHS)[keyof typeof SITE_PATHS];

/** `<siteBaseUrl><path>?<query>`. */
export function sitePageUrl(siteBaseUrl: string, path: SitePath, query: URLSearchParams | string): string {
  const q = String(query);
  return `${siteBaseUrl}${path}${q ? `?${q}` : ""}`;
}

/** True if the value looks like a plain object. */
export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parses an ISO-8601 / RFC 3339 timestamp (`2026-11-16T18:00:00Z`, with an optional fractional part of
 * any length and a `Z` or `±hh:mm` offset) into epoch milliseconds; `null` for anything else (PROTOCOL §7.0).
 * Stricter than `Date.parse`, which accepts strings like `"1"`, and independent of how the engine treats long fractions.
 */
export function parseIsoTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac = "", zone = "Z"] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(Number(y), month, 0)).getUTCDate()) return null;
  if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}.${frac.padEnd(3, "0").slice(0, 3)}${zone.toUpperCase()}`);
  return Number.isNaN(ms) ? null : ms;
}
