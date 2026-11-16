/**
 * Targets, target sets and PKCE (PROTOCOL §1, §2), implemented with Web Crypto
 * only so they run in browsers, Workers, Node, Bun and Deno.
 */
import { SponsorkitError } from "./errors";
import type { Provider, TargetOptions } from "./types";

/** A normalized target. */
export interface Target {
  provider: Provider;
  /** Lowercased, trimmed login or slug. */
  account: string;
}

const GITHUB_LOGIN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/;
const OC_SLUG = /^[a-z0-9][a-z0-9-]{0,254}$/;

/** Normalizes and validates one target. Throws `invalid_config` when malformed. */
export function normalizeTarget(provider: string, account: string): Target {
  if (provider !== "github" && provider !== "opencollective") {
    throw new SponsorkitError("invalid_config", `Unknown provider "${provider}"`);
  }
  if (typeof account !== "string") throw new SponsorkitError("invalid_config", `Invalid ${provider} account`);
  const a = account.trim().toLowerCase();
  const ok = provider === "github" ? GITHUB_LOGIN.test(a) : OC_SLUG.test(a);
  if (!ok) throw new SponsorkitError("invalid_config", `Invalid ${provider} account "${account}"`);
  return { provider, account: a };
}

/** `github:<login>` / `opencollective:<slug>`. */
export function targetToString(t: Target): string {
  return `${t.provider}:${t.account}`;
}

/** Parses `provider:account`. Throws `invalid_config` when malformed. */
export function parseTarget(s: string): Target {
  const i = s.indexOf(":");
  if (i <= 0) throw new SponsorkitError("invalid_config", `Invalid target "${s}"`);
  return normalizeTarget(s.slice(0, i), s.slice(i + 1));
}

/** Deduplicates and sorts (byte-wise) a target set; at least one target, at most one per provider. */
export function canonicalTargets(targets: readonly Target[]): Target[] {
  const map = new Map<string, Target>();
  for (const t of targets) map.set(targetToString(t), t);
  const sorted = [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, t]) => t);
  if (sorted.length === 0) throw new SponsorkitError("invalid_config", "At least one target (github or opencollective) is required");
  if (new Set(sorted.map((t) => t.provider)).size !== sorted.length) {
    throw new SponsorkitError("invalid_config", "At most one target per provider is supported");
  }
  return sorted;
}

/** Builds the canonical target set from `{ github?, opencollective? }`, a target param string, or a list of target strings. */
export function targetsFrom(input: TargetOptions | string | readonly string[]): Target[] {
  if (typeof input === "string") return canonicalTargets(input.split(",").filter(Boolean).map(parseTarget));
  if (Array.isArray(input)) return canonicalTargets((input as readonly string[]).map(parseTarget));
  if (!input || typeof input !== "object") throw new SponsorkitError("invalid_config", "Targets are required");
  const opts = input as TargetOptions;
  const out: Target[] = [];
  if (opts.github !== undefined && opts.github !== null) out.push(normalizeTarget("github", opts.github));
  if (opts.opencollective !== undefined && opts.opencollective !== null) out.push(normalizeTarget("opencollective", opts.opencollective));
  return canonicalTargets(out);
}

/** The canonical target param: `github:x,opencollective:y`. */
export function targetsParam(targets: readonly Target[]): string {
  return canonicalTargets(targets).map(targetToString).join(",");
}

const encoder = new TextEncoder();

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new SponsorkitError("invalid_config", "Web Crypto (globalThis.crypto.subtle) is not available");
  return c.subtle;
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest("SHA-256", encoder.encode(text)));
}

/** base64url without padding. */
export function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `targets_hash`: lowercase hex SHA-256 of the UTF-8 target param (storage key). */
export async function targetsHash(targetsOrParam: readonly Target[] | string): Promise<string> {
  const param = typeof targetsOrParam === "string" ? targetsOrParam : targetsParam(targetsOrParam);
  const digest = await sha256(param);
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A new PKCE `code_verifier`: 32 random bytes, base64url (43 characters). */
export function createCodeVerifier(): string {
  return base64url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

/** PKCE S256: `base64url(sha256(ascii(verifier)))`. */
export async function codeChallenge(verifier: string): Promise<string> {
  return base64url(await sha256(verifier));
}
