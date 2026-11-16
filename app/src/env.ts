/** Worker bindings and configuration. */

/** Workers Rate Limiting binding (https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Static assets binding. */
export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
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
  PUBLIC_ORIGIN?: string;
  GITHUB_OAUTH_BASE?: string;
  GITHUB_API_BASE?: string;
  OPENCOLLECTIVE_BASE?: string;
  OPENCOLLECTIVE_API_BASE?: string;

  ASSETS?: AssetsBinding;
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
