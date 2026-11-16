/** Exports shared by every entry point. */

export {
  type CodeRequest,
  DEFAULT_API_BASE_URL,
  DEFAULT_CACHE_TTL,
  DEFAULT_CHECKOUT_POLL_INTERVAL,
  DEFAULT_CHECKOUT_TIMEOUT,
  type Nag,
  type NagDueOptions,
  type NagOptions,
  type NagPredicate,
  type OpenCheckoutOptions,
  resetProcessState,
  type SignInOptions,
  SponsorkitCore,
  type SponsorkitCoreOptions,
} from "./core";
export { isSponsorkitError, SponsorkitError, type SponsorkitErrorCode } from "./errors";
export type { FetchLike } from "./http";
export { MOCK_PRESETS } from "./mock";
export { FinancialContribution } from "./result";
export { localStorageAdapter, memoryStorage, type SponsorkitStorage, type WebStorageLike } from "./storage";
export {
  canonicalTargets,
  codeChallenge,
  createCodeVerifier,
  normalizeTarget,
  parseTarget,
  type Target,
  targetsFrom,
  targetsHash,
  targetsParam,
  targetToString,
} from "./targets";
export * from "./types";
export type { Env } from "./util";
