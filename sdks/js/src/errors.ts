/**
 * Error codes carried by {@link SponsorkitError} (PROTOCOL §7).
 *
 * - `invalid_config`: missing or invalid configuration or options (including targets that don't exist, checked at dev time).
 * - `disabled`: Sponsorkit is disabled via `SPONSORKIT_DISABLE`.
 * - `popup_blocked`: the browser blocked the sign-in/checkout popup and no redirect fallback applies.
 * - `access_denied`, `invalid_state`, `provider_error`: sign-in errors delivered to the callback.
 * - `invalid_code`: the API rejected the sign-in code exchange (`400 invalid_code`).
 * - `cancelled`: sign-in was abandoned or cancelled (popup closed, `AbortSignal` aborted, no code entered).
 * - `timeout`: sign-in exceeded `signInTimeout` (default 300 s).
 * - `network_error`: the API couldn't be reached, or returned 5xx, 429 or an unexpected response, during
 *   `signIn()` or `verifySession()`. Carries {@link SponsorkitError.retryAfter} when the API sent `Retry-After`.
 * - `session_invalid`, `targets_mismatch`: only from `verifySession()`.
 *
 * `getFinancialContribution()` never throws for network or server problems.
 */
export type SponsorkitErrorCode =
  | "invalid_config"
  | "disabled"
  | "popup_blocked"
  | "access_denied"
  | "invalid_state"
  | "provider_error"
  | "invalid_code"
  | "cancelled"
  | "timeout"
  | "network_error"
  | "session_invalid"
  | "targets_mismatch";

/** All error codes, in PROTOCOL §7 order. */
export const SPONSORKIT_ERROR_CODES: readonly SponsorkitErrorCode[] = [
  "invalid_config",
  "disabled",
  "popup_blocked",
  "access_denied",
  "invalid_state",
  "provider_error",
  "invalid_code",
  "cancelled",
  "timeout",
  "network_error",
  "session_invalid",
  "targets_mismatch",
];

/** The only error type thrown by the SDK. Check {@link SponsorkitError.code}. */
export class SponsorkitError extends Error {
  /** Machine-readable error code. */
  readonly code: SponsorkitErrorCode;
  /** For `network_error`: seconds to wait before retrying, when the API sent `Retry-After`. Otherwise `undefined`. */
  readonly retryAfter: number | undefined;

  constructor(code: SponsorkitErrorCode, message?: string, options?: { cause?: unknown; retryAfter?: number }) {
    super(message ?? code, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SponsorkitError";
    this.code = code;
    this.retryAfter = options?.retryAfter;
  }
}

/** True if `error` is a {@link SponsorkitError} (optionally with the given code). */
export function isSponsorkitError(error: unknown, code?: SponsorkitErrorCode): error is SponsorkitError {
  return error instanceof SponsorkitError && (code === undefined || error.code === code);
}
