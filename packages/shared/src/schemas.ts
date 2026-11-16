import { z } from "zod";
import { Provider } from "./targets";

export const Money = z.object({
  /** Minor units (cents). */
  value: z.number().int(),
  /** ISO 4217, uppercase. */
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type Money = z.infer<typeof Money>;

export const STATUSES = ["active", "paused", "cancelled", "paid", "refunded", "disputed", "failed", "pending"] as const;
export const Status = z.enum(STATUSES);
export type Status = z.infer<typeof Status>;

export const Frequency = z.enum(["one_time", "monthly", "yearly"]);
export type Frequency = z.infer<typeof Frequency>;

export const Kind = z.enum(["recurring", "one_time"]);
export type Kind = z.infer<typeof Kind>;

export const Flag = z.enum(["via_patreon"]);
export type Flag = z.infer<typeof Flag>;

export const SponsorEntity = z.object({
  type: z.enum(["user", "organization"]),
  provider: Provider,
  id: z.string(),
  handle: z.string().nullable(),
});
export type SponsorEntity = z.infer<typeof SponsorEntity>;

export const Tier = z.object({ id: z.string(), name: z.string() });

export const Contribution = z.object({
  /** Stable: `con_<provider>_<base64url(sha256(provider + ":" + externalId)) first 22 chars>`. */
  id: z.string(),
  provider: Provider,
  /** Target string, e.g. `github:mathiaslorenzen`. */
  target: z.string(),
  sponsor: SponsorEntity,
  via: z.enum(["direct", "organization"]),
  kind: Kind,
  frequency: Frequency,
  status: Status,
  amount: Money,
  tier: Tier.nullable(),
  flags: z.array(Flag),
  private: z.boolean(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  lastChargedAt: z.string().nullable(),
  nextChargeAt: z.string().nullable(),
  totalContributed: Money.nullable(),
});
export type Contribution = z.infer<typeof Contribution>;

export const Identity = z.object({
  provider: Provider,
  /** Immutable provider user id (GitHub databaseId, OC account id). */
  id: z.string(),
  handle: z.string().nullable(),
  needsReconnect: z.boolean(),
});
export type Identity = z.infer<typeof Identity>;

export const Supporter = z.object({
  /** Pairwise id: `sup_` + base32(HMAC(...)) — stable per (target set, sign-in identity). */
  id: z.string(),
  identities: z.array(Identity),
});
export type Supporter = z.infer<typeof Supporter>;

/** The result shape returned by `GET /api/v1/contributions` and by every SDK's getFinancialContribution(). */
export const ContributionResult = z.object({
  signedIn: z.boolean(),
  disabled: z.boolean(),
  mock: z.boolean(),
  targets: z.array(z.string()),
  supporter: Supporter.nullable(),
  contributions: z.array(Contribution),
  fetchedAt: z.string().nullable(),
  /** Some provider could not be reached; its data (if any) comes from the SDK cache. */
  stale: z.boolean(),
  /** Whole result served from the SDK's local cache. Always false from the API. */
  fromCache: z.boolean(),
  /** Providers that could not be queried (API only; SDK merges cached data for them). */
  unavailable: z.array(Provider).optional(),
});
export type ContributionResult = z.infer<typeof ContributionResult>;

// ---------- /api/v1/targets ----------

export const TargetTier = z.object({
  id: z.string(),
  name: z.string(),
  amount: Money,
  frequency: Frequency,
  /** Deep link to sponsor/contribute at this tier, if known. */
  url: z.string().nullable(),
});
export type TargetTier = z.infer<typeof TargetTier>;

export const TargetInfo = z.object({
  target: z.string(),
  provider: Provider,
  account: z.string(),
  exists: z.boolean(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** Public profile / sponsor page URL. */
  url: z.string().nullable(),
  currency: z.string().nullable(),
  /** Frequencies this target accepts. */
  frequencies: z.array(Frequency),
  /** Whether arbitrary amounts are accepted (OC: true; GitHub: only if a custom-amount tier exists). */
  customAmount: z.boolean(),
  tiers: z.array(TargetTier),
});
export type TargetInfo = z.infer<typeof TargetInfo>;

export const TargetsResponse = z.object({ targets: z.array(TargetInfo) });
export type TargetsResponse = z.infer<typeof TargetsResponse>;

// ---------- /api/v1/auth/token ----------

export const TokenRequest = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  /** Existing session to add the new identity to (same target set required). */
  sessionToken: z.string().optional(),
});
export type TokenRequest = z.infer<typeof TokenRequest>;

export const TokenResponse = z.object({
  sessionToken: z.string(),
  expiresAt: z.string(),
  result: ContributionResult,
});
export type TokenResponse = z.infer<typeof TokenResponse>;

// ---------- errors (application/problem+json) ----------

export const ERROR_CODES = [
  "invalid_request",
  "invalid_target",
  "invalid_code",
  "session_invalid",
  "rate_limited",
  "not_found",
  "internal",
] as const;
export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const Problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: ErrorCode,
  detail: z.string().optional(),
});
export type Problem = z.infer<typeof Problem>;

// ---------- browser / loopback / paste delivery messages ----------

export const Delivery = z.enum(["web_message", "redirect", "loopback", "paste"]);
export type Delivery = z.infer<typeof Delivery>;

/** postMessage payload sent by /connect/done and /checkout to window.opener. */
export const WindowMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sponsorkit:code"), code: z.string() }),
  z.object({ type: z.literal("sponsorkit:error"), error: z.string() }),
  z.object({ type: z.literal("sponsorkit:checkout_redirected"), provider: Provider }),
]);
export type WindowMessage = z.infer<typeof WindowMessage>;

export const HEADERS = {
  requestId: "Sponsorkit-Request-Id",
  renewedSession: "Sponsorkit-Session",
} as const;

export const SESSION_PREFIX = "sks_";
export const CODE_PREFIX = "skc_";
