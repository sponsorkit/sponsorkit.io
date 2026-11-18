/**
 * Where the site (static pages on GitHub Pages) and the API (the Worker) live, and the paths on
 * each (PROTOCOL §0, §4, §7). The site and the API are separate origins by default; single-origin
 * self-hosting sets both to the same base URL.
 */

/** Default site base URL: a GitHub Pages project site. Origin + base path, no trailing slash. */
export const DEFAULT_SITE_BASE_URL = "https://sponsorkit.github.io/sponsorkit.io";
/** Default site origin (the Worker's SITE_ORIGIN): the origin of DEFAULT_SITE_BASE_URL. */
export const DEFAULT_SITE_ORIGIN = "https://sponsorkit.github.io";
/** Default API base URL (the Worker's PUBLIC_ORIGIN). An origin, no path, no trailing slash. */
export const DEFAULT_API_BASE_URL = "https://api.sponsorkit.io";

/**
 * Page paths on the site, relative to the site base URL. Always the trailing-slash form, because
 * GitHub Pages serves directories (`/connect/` → `connect/index.html`).
 */
export const SITE_PATHS = {
  connect: "/connect/",
  connectDone: "/connect/done/",
  checkout: "/checkout/",
  checkoutThanks: "/checkout/thanks/",
  /** Target of `Problem.type` (PROTOCOL §3). */
  apiErrors: "/docs/reference-http/http-api/#errors",
} as const;

/** API paths, relative to the API base URL. */
export const API_PATHS = {
  targets: "/api/v1/targets",
  token: "/api/v1/auth/token",
  contributions: "/api/v1/contributions",
  health: "/api/v1/health",
  /** POST only (PROTOCOL §4.3). */
  oauthStart: (provider: string) => `/api/oauth/${provider}/start`,
  oauthCallback: (provider: string) => `/api/oauth/${provider}/callback`,
} as const;

/**
 * Form fields of `POST /api/oauth/:provider/start` (application/x-www-form-urlencoded). The same
 * names as the §4.1 query parameters, plus `continue`.
 */
export const OAUTH_START_FIELDS = [
  "targets",
  "challenge",
  "delivery",
  "origin",
  "redirect_uri",
  "app_name",
  "provider",
  "add",
  "continue",
] as const;

export function trimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

export interface BaseUrls {
  /** Origin of the API, no trailing slash. */
  apiBaseUrl: string;
  /** Site base URL (origin + optional base path), no trailing slash. */
  siteBaseUrl: string;
}

/**
 * SDK defaulting rule (PROTOCOL §7): each option falls back to its default, except that a set
 * `apiBaseUrl` with no `siteBaseUrl` makes the site default to the API base URL (single-origin
 * self-hosting, the conformance server). Empty strings count as unset.
 */
export function resolveBaseUrls(opts: { apiBaseUrl?: string | null; siteBaseUrl?: string | null } = {}): BaseUrls {
  const api = opts.apiBaseUrl ? trimTrailingSlashes(opts.apiBaseUrl) : null;
  const site = opts.siteBaseUrl ? trimTrailingSlashes(opts.siteBaseUrl) : null;
  return {
    apiBaseUrl: api ?? DEFAULT_API_BASE_URL,
    siteBaseUrl: site ?? api ?? DEFAULT_SITE_BASE_URL,
  };
}

/** The origin `postMessage` events must come from: the origin of the site base URL. */
export function siteOrigin(siteBaseUrl: string): string {
  return new URL(siteBaseUrl).origin;
}

/** `<siteBaseUrl><path>[?query]` for a SITE_PATHS entry. */
export function siteUrl(siteBaseUrl: string, path: string, query?: URLSearchParams | string): string {
  const q = query === undefined ? "" : typeof query === "string" ? query : query.toString();
  return `${trimTrailingSlashes(siteBaseUrl)}${path}${q ? `?${q}` : ""}`;
}

/** `Problem.type` for a deployment whose site lives at `siteBaseUrl`. */
export function problemTypeUrl(siteBaseUrl: string = DEFAULT_SITE_BASE_URL): string {
  return `${trimTrailingSlashes(siteBaseUrl)}${SITE_PATHS.apiErrors}`;
}
