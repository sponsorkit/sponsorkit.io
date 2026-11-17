/**
 * Public data types. They mirror the canonical schemas in `packages/shared`
 * (PROTOCOL §3, SPEC §5.1) but are declared here so the published `.d.ts`
 * files are self-contained.
 */

/** A contribution platform supported by Sponsorkit. */
export type Provider = "github" | "opencollective";

/** All providers, in canonical order. */
export const PROVIDERS: readonly Provider[] = ["github", "opencollective"];

/** An amount of money in minor units (cents) with its ISO 4217 currency. */
export interface Money {
  /** Minor units, e.g. `500` for $5.00. */
  value: number;
  /** ISO 4217, uppercase, e.g. `"USD"`. */
  currency: string;
}

/** Normalized contribution status (SPEC §5.2). */
export type ContributionStatus = "active" | "paused" | "cancelled" | "paid" | "refunded" | "disputed" | "failed" | "pending";

/** How often a contribution is charged. */
export type Frequency = "one_time" | "monthly" | "yearly";

/** Whether a contribution recurs. */
export type ContributionKind = "recurring" | "one_time";

/** Who actually pays for a contribution: the user, or an organization the user belongs to. */
export interface SponsorEntity {
  type: "user" | "organization";
  provider: Provider;
  id: string;
  handle: string | null;
}

/** A sponsorship (GitHub) or order (Open Collective), normalized (SPEC §5.1). */
export interface Contribution {
  /** Stable id: `con_<provider>_<hash>`. */
  id: string;
  provider: Provider;
  /** Target string, e.g. `github:octocat`. */
  target: string;
  sponsor: SponsorEntity;
  via: "direct" | "organization";
  kind: ContributionKind;
  frequency: Frequency;
  status: ContributionStatus;
  amount: Money;
  tier: { id: string; name: string } | null;
  flags: "via_patreon"[];
  private: boolean;
  startedAt: string | null;
  endedAt: string | null;
  lastChargedAt: string | null;
  nextChargeAt: string | null;
  totalContributed: Money | null;
}

/** A supporter's provider account (without its token, which never leaves Sponsorkit). */
export interface Identity {
  provider: Provider;
  /** Immutable provider user id. */
  id: string;
  handle: string | null;
  /** The provider token expired or was revoked; sign in with this provider again. */
  needsReconnect: boolean;
}

/** The signed-in supporter. */
export interface Supporter {
  /** Pairwise id, stable per (target set, first sign-in identity). */
  id: string;
  identities: Identity[];
}

/** The plain JSON result of `getFinancialContribution()` (SPEC §5.1). */
export interface ContributionResult {
  signedIn: boolean;
  disabled: boolean;
  mock: boolean;
  /** Canonical target strings, e.g. `["github:octocat"]`. */
  targets: string[];
  supporter: Supporter | null;
  contributions: Contribution[];
  fetchedAt: string | null;
  /** Some provider could not be reached; its data (if any) comes from the local cache. */
  stale: boolean;
  /** The whole result was served from the local cache. */
  fromCache: boolean;
  /** Providers the API could not query (API results only). */
  unavailable?: Provider[];
}

/** A tier of a target's sponsorship listing. */
export interface TargetTier {
  id: string;
  name: string;
  amount: Money;
  frequency: Frequency;
  url: string | null;
}

/** Public metadata about a target (`GET /api/v1/targets`). */
export interface TargetInfo {
  target: string;
  provider: Provider;
  account: string;
  exists: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  url: string | null;
  currency: string | null;
  frequencies: Frequency[];
  customAmount: boolean;
  tiers: TargetTier[];
}

/** The names of the built-in mock presets (SPEC §7.4). */
export type MockPreset = "signed-out" | "none" | "active-monthly" | "one-time" | "cancelled" | "org";

/** Mock mode: a preset name, or custom contributions to report as the signed-in supporter's. */
export type MockOption = MockPreset | { contributions: Contribution[] };

/** Targets as accepted by `verifySession()`. */
export interface TargetOptions {
  /** GitHub user or organization login. */
  github?: string | null;
  /** Open Collective collective slug. */
  opencollective?: string | null;
}

/** Options for `openCheckout()` and `checkoutUrl()`. */
export interface CheckoutOptions {
  /** Preferred provider. The checkout page never silently switches provider. */
  provider?: Provider;
  /** Amount in minor units (cents). */
  amount?: number;
  /** ISO 4217 currency, e.g. `"USD"`. */
  currency?: string;
  frequency?: Frequency;
}

/** The outcome of `openCheckout()`. */
export type CheckoutResult = { status: "contributed"; contribution: Contribution } | { status: "unknown" };

/** Nag state as persisted in the {@link StorageFile}, keyed by nag id. */
export interface NagState {
  runs: number;
  lastShown: string | null;
}

/** The JSON document stored per target set (session token, cached result and nag state). */
export interface StorageFile {
  v: 1;
  sessionToken?: string | null;
  cache?: { result: ContributionResult; storedAt: string } | null;
  nags?: Record<string, NagState>;
}
