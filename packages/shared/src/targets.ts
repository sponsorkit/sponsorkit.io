import { z } from "zod";

export const PROVIDERS = ["github", "opencollective"] as const;
export const Provider = z.enum(PROVIDERS);
export type Provider = z.infer<typeof Provider>;

/** GitHub logins: 1-39 chars, alphanumeric or single hyphens, no leading/trailing hyphen. */
const GITHUB_LOGIN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/;
/** Open Collective slugs: lowercase alphanumerics and hyphens. */
const OC_SLUG = /^[a-z0-9][a-z0-9-]{0,254}$/;

export interface Target {
  provider: Provider;
  /** Normalized (lowercased) account login / slug. */
  account: string;
}

/** Canonical string form: `github:<login>` / `opencollective:<slug>`. */
export type TargetString = `${Provider}:${string}`;

export class InvalidTargetError extends Error {
  readonly code = "invalid_target";
  constructor(message: string) {
    super(message);
    this.name = "InvalidTargetError";
  }
}

export function normalizeTarget(provider: string, account: string): Target {
  const p = Provider.safeParse(provider);
  if (!p.success) throw new InvalidTargetError(`Unknown provider "${provider}"`);
  const a = account.trim().toLowerCase();
  const valid = p.data === "github" ? GITHUB_LOGIN.test(a) : OC_SLUG.test(a);
  if (!valid) throw new InvalidTargetError(`Invalid ${p.data} account "${account}"`);
  return { provider: p.data, account: a };
}

export function targetToString(t: Target): TargetString {
  return `${t.provider}:${t.account}`;
}

export function parseTargetString(s: string): Target {
  const i = s.indexOf(":");
  if (i <= 0) throw new InvalidTargetError(`Invalid target "${s}"`);
  return normalizeTarget(s.slice(0, i), s.slice(i + 1));
}

/**
 * Canonical target set: deduplicated, sorted by string form, at least one target,
 * at most one target per provider (v1).
 */
export function canonicalTargets(targets: Target[]): Target[] {
  const byString = new Map<string, Target>();
  for (const t of targets) byString.set(targetToString(t), t);
  const sorted = [...byString.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, t]) => t);
  if (sorted.length === 0) throw new InvalidTargetError("At least one target is required");
  const providers = new Set(sorted.map((t) => t.provider));
  if (providers.size !== sorted.length) throw new InvalidTargetError("At most one target per provider is supported");
  return sorted;
}

/** Comma-separated canonical form used in URLs: `github:x,opencollective:y`. */
export function targetsToParam(targets: Target[]): string {
  return canonicalTargets(targets).map(targetToString).join(",");
}

export function targetsFromParam(param: string): Target[] {
  return canonicalTargets(param.split(",").filter(Boolean).map(parseTargetString));
}

/** Build a target set from SDK-style options `{ github?, opencollective? }`. */
export function targetsFromOptions(opts: { github?: string | null; opencollective?: string | null }): Target[] {
  const out: Target[] = [];
  if (opts.github) out.push(normalizeTarget("github", opts.github));
  if (opts.opencollective) out.push(normalizeTarget("opencollective", opts.opencollective));
  return canonicalTargets(out);
}

/**
 * targets_hash = lowercase hex SHA-256 of the canonical param string (UTF-8).
 * Every SDK must compute it identically (used for local storage keys).
 */
export async function targetsHash(targets: Target[]): Promise<string> {
  const data = new TextEncoder().encode(targetsToParam(targets));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
