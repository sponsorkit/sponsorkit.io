/** Worker bindings and configuration. */

/** Workers Rate Limiting binding (https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  OPENCOLLECTIVE_CLIENT_ID?: string;
  OPENCOLLECTIVE_CLIENT_SECRET?: string;
  /** JSON `[{ id, key }]`, first entry is current. */
  SEALING_KEYS?: string;
  PAIRWISE_KEY?: string;
  /** Token used only for public `/targets` metadata. */
  GITHUB_METADATA_TOKEN?: string;
  /** The API origin (PROTOCOL §0.1); used for provider callback URLs. Defaults to the request origin. */
  PUBLIC_ORIGIN?: string;
  /** Site base URL (origin + optional base path); deliveries, consent and docs links. Defaults to PUBLIC_ORIGIN. */
  SITE_BASE_URL?: string;
  /** The only `Origin` accepted by `POST /api/oauth/:provider/start`. Defaults to the origin of SITE_BASE_URL. */
  SITE_ORIGIN?: string;
  GITHUB_OAUTH_BASE?: string;
  GITHUB_API_BASE?: string;
  OPENCOLLECTIVE_BASE?: string;
  OPENCOLLECTIVE_API_BASE?: string;

  RL_AUTH?: RateLimitBinding;
  RL_REFRESH?: RateLimitBinding;
  RL_IP?: RateLimitBinding;
  /** `/contributions` per client IP (SPEC §8: 60/min). */
  RL_CONTRIB_IP?: RateLimitBinding;
  /** Uncached `/targets` lookups per client IP (they spend the shared metadata token's quota). */
  RL_TARGETS_MISS?: RateLimitBinding;
  /** Uncached `/targets` lookups in total (single key). */
  RL_TARGETS_MISS_GLOBAL?: RateLimitBinding;
}

export interface ProviderUrls {
  githubOAuth: string;
  githubApi: string;
  ocBase: string;
  ocApi: string;
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

export function providerUrls(env: Env): ProviderUrls {
  return {
    githubOAuth: trimSlash(env.GITHUB_OAUTH_BASE || "https://github.com"),
    githubApi: trimSlash(env.GITHUB_API_BASE || "https://api.github.com"),
    ocBase: trimSlash(env.OPENCOLLECTIVE_BASE || "https://opencollective.com"),
    ocApi: trimSlash(env.OPENCOLLECTIVE_API_BASE || "https://api.opencollective.com"),
  };
}

/** Our public origin: PUBLIC_ORIGIN if configured, else the request's origin. */
export function publicOrigin(env: Env, requestUrl: string): string {
  if (env.PUBLIC_ORIGIN) return trimSlash(env.PUBLIC_ORIGIN);
  return new URL(requestUrl).origin;
}

/**
 * Site base URL, leniently (no validation): SITE_BASE_URL if configured, else the API origin
 * (single-origin self-hosting). Used for links that must render even when the config is invalid.
 */
export function siteBaseUrl(env: Env, requestUrl: string): string {
  return env.SITE_BASE_URL ? trimSlash(env.SITE_BASE_URL) : publicOrigin(env, requestUrl);
}

export interface SiteConfig {
  /** Origin + optional base path, no trailing slash. */
  siteBaseUrl: string;
  /** Bare origin of the site; the only `Origin` accepted by the OAuth start (PROTOCOL §4.3). */
  siteOrigin: string;
}

/**
 * Validated site configuration (PROTOCOL §0.1). SITE_ORIGIN must be a bare http(s) origin equal
 * to the origin of SITE_BASE_URL; anything else throws ConfigError so sign-in fails closed.
 */
export function siteConfig(env: Env, requestUrl: string): SiteConfig {
  const base = siteBaseUrl(env, requestUrl);
  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    throw new ConfigError("Invalid configuration: SITE_BASE_URL");
  }
  if ((baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") || baseUrl.search || baseUrl.hash || base.includes("#")) {
    throw new ConfigError("Invalid configuration: SITE_BASE_URL");
  }
  const origin = env.SITE_ORIGIN ? trimSlash(env.SITE_ORIGIN) : baseUrl.origin;
  let originOk = false;
  try {
    originOk = new URL(origin).origin === origin;
  } catch {
    originOk = false;
  }
  if (!originOk || origin !== baseUrl.origin) {
    throw new ConfigError("Invalid configuration: SITE_ORIGIN must be the bare origin of SITE_BASE_URL");
  }
  return { siteBaseUrl: base, siteOrigin: origin };
}

/** Thrown when a required secret is missing; maps to a 500 `internal` problem. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function requireSecret(env: Env, name: keyof Env): string {
  const v = env[name];
  if (typeof v !== "string" || v.length === 0) throw new ConfigError(`Missing configuration: ${name}`);
  return v;
}
