import type { Contribution, Provider, Target, TargetInfo } from "@sponsorkit/shared";
import type { Env } from "../env";

export interface ProviderToken {
  accessToken: string;
  /** Unix seconds; undefined when the token does not expire (GitHub). */
  expiresAt?: number;
}

export interface ProviderIdentity {
  /** Immutable provider user id (GitHub databaseId, OC account id). */
  id: string;
  handle: string | null;
}

export interface AuthorizeParams {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

/** Common adapter interface; every provider (github, opencollective, later patreon…) implements it. */
export interface ProviderAdapter {
  readonly provider: Provider;
  /** Whether the provider's authorize/token endpoints implement PKCE. */
  readonly supportsPkce: boolean;
  authorizeUrl(params: AuthorizeParams): string;
  exchangeCode(code: string, redirectUri: string, codeVerifier: string): Promise<ProviderToken>;
  fetchIdentity(token: string): Promise<ProviderIdentity>;
  /** Contributions from the identity (and its organizations) to `target`. */
  fetchContributions(token: string, identity: ProviderIdentity, target: Target): Promise<Contribution[]>;
  /** Public metadata for `target`. A target that doesn't exist returns `exists: false`. */
  fetchTargetInfo(target: Target): Promise<TargetInfo>;
  /** Cheap reachability probe for /health. */
  ping(): Promise<boolean>;
}

export type AdapterFactory = (env: Env) => ProviderAdapter;

/** Provider call failed (network, 5xx, rate limit, malformed response). */
export class ProviderError extends Error {
  constructor(
    readonly provider: Provider,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Provider rejected the user's token (expired / revoked): identity needs reconnecting. */
export class ProviderAuthError extends ProviderError {
  constructor(provider: Provider, message = "provider token rejected", status?: number) {
    super(provider, message, status);
    this.name = "ProviderAuthError";
  }
}

/** The OAuth code exchange failed (bad/expired code, wrong verifier, misconfiguration). */
export class OAuthExchangeError extends ProviderError {
  constructor(provider: Provider, message: string, status?: number) {
    super(provider, message, status);
    this.name = "OAuthExchangeError";
  }
}

export const PROVIDER_TIMEOUT_MS = 10_000;

/** fetch with a timeout; network errors become ProviderError. */
export async function providerFetch(provider: Provider, url: string, init: RequestInit, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    throw new ProviderError(provider, controller.signal.aborted ? "timeout" : "network error");
  } finally {
    clearTimeout(timer);
  }
}

export interface GraphQLResponse<T> {
  data?: T | null;
  errors?: Array<{ message?: string; type?: string; path?: Array<string | number>; extensions?: { code?: string } }>;
}

export async function readJson<T>(provider: Provider, res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new ProviderError(provider, "invalid JSON from provider", res.status);
  }
}

export function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
