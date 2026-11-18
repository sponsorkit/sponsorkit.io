/**
 * Where this site lives (PROTOCOL §0). Values are inlined at build time by next.config.ts
 * (see web/site-config.ts); the fallbacks apply in unit tests.
 */
import { DEFAULT_SITE_BASE_URL, SITE_PATHS, trimTrailingSlashes } from "@sponsorkit/shared";

/** Next.js basePath: "" or "/sponsorkit.io". */
export const BASE_PATH = trimTrailingSlashes(process.env.NEXT_PUBLIC_BASE_PATH ?? "");

/** Absolute site base URL used for canonical URLs, og:url and the sitemap (no trailing slash). */
export const SITE_URL = trimTrailingSlashes(process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_BASE_URL);

/** Whether page URLs end in `/` (TRAILING_SLASH, on by default). */
export const TRAILING_SLASH = (process.env.NEXT_PUBLIC_TRAILING_SLASH ?? "1") === "1";

export { SITE_PATHS };

/** Root-relative URL of a site page, e.g. `sitePath("/checkout/")` → `/sponsorkit.io/checkout/`. */
export function sitePath(path: string, basePath: string = BASE_PATH): string {
  return `${basePath}${path}`;
}

/**
 * Absolute URL of a route for metadata and the sitemap: `/docs/x` → `<SITE_URL>/docs/x/`
 * (without the final slash when the site is built with TRAILING_SLASH=0).
 */
export function absoluteUrl(route: string, siteUrl: string = SITE_URL, trailingSlash: boolean = TRAILING_SLASH): string {
  const r = route.replace(/\/+$/, "");
  if (r === "") return `${siteUrl}/`;
  return `${siteUrl}${r}${trailingSlash ? "/" : ""}`;
}

/** The site base URL as seen by the browser: `location.origin` + basePath (PROTOCOL §6). */
export function browserSiteBaseUrl(): string {
  return `${window.location.origin}${BASE_PATH}`;
}
