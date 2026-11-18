/**
 * Build-time site settings, shared by next.config.ts and the scripts in web/scripts (PROTOCOL §0.2).
 *
 * Defaults target the GitHub Pages project site (https://sponsorkit.github.io/sponsorkit.io) with the
 * API on https://api.sponsorkit.io. Every value can be overridden from the environment:
 *
 * | Variable                          | Default                                   | Meaning |
 * |-----------------------------------|-------------------------------------------|---------|
 * | `BASE_PATH`                       | `/sponsorkit.io`                          | Next.js basePath. `BASE_PATH=` (empty) builds at the root. |
 * | `TRAILING_SLASH`                  | `1`                                       | `0` exports `x.html` instead of `x/index.html`. |
 * | `SITE_URL`                        | `https://sponsorkit.github.io<BASE_PATH>` | Absolute site base URL (canonical URLs, og:url, sitemap). |
 * | `NEXT_PUBLIC_SPONSORKIT_API_BASE` | `https://api.sponsorkit.io`               | API origin. Empty = same origin (`/api/…`). |
 *
 * Single-origin self-hosting (site and API behind one origin, served at its root):
 *   BASE_PATH= SITE_URL=https://sponsors.example.com NEXT_PUBLIC_SPONSORKIT_API_BASE= bun run build
 * (or `bun run build:root`, which sets BASE_PATH and the API base to empty).
 */

export const DEFAULT_BASE_PATH = "/sponsorkit.io";
export const DEFAULT_SITE_ORIGIN = "https://sponsorkit.github.io";
export const DEFAULT_API_BASE = "https://api.sponsorkit.io";

export interface SiteConfig {
  /** "" or "/x" (no trailing slash). */
  basePath: string;
  trailingSlash: boolean;
  /** Origin + basePath, no trailing slash. */
  siteUrl: string;
  /** API origin without trailing slash; "" = same origin. */
  apiBase: string;
}

const trim = (v: string) => v.trim().replace(/\/+$/, "");

export function siteConfig(env: Record<string, string | undefined> = process.env): SiteConfig {
  const basePath = env.BASE_PATH === undefined ? DEFAULT_BASE_PATH : trim(env.BASE_PATH);
  if (basePath !== "" && !/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(basePath)) {
    throw new Error(`BASE_PATH must be empty or look like /segment, got ${JSON.stringify(env.BASE_PATH)}`);
  }
  const trailingSlash = env.TRAILING_SLASH === undefined || env.TRAILING_SLASH === "" ? true : env.TRAILING_SLASH !== "0";
  const siteUrl = env.SITE_URL ? trim(env.SITE_URL) : `${DEFAULT_SITE_ORIGIN}${basePath}`;
  const apiBase = env.NEXT_PUBLIC_SPONSORKIT_API_BASE === undefined ? DEFAULT_API_BASE : trim(env.NEXT_PUBLIC_SPONSORKIT_API_BASE);
  return { basePath, trailingSlash, siteUrl, apiBase };
}
