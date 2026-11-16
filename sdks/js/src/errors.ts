/**
 * Error codes carried by {@link SponsorkitError} (PROTOCOL §7).
 *
 * - `invalid_config`: missing or invalid configuration (including targets that don't exist, checked at dev time).
 * - `disabled`: Sponsorkit is disabled via `SPONSORKIT_DISABLE`.
 * - `popup_blocked`: the browser blocked the sign-in/checkout popup and no redirect fallback applies.
 * - `access_denied`, `invalid_state`, `provider_error`: sign-in errors delivered to the callback.
 *   `access_denied` is also used when the user abandons sign-in (popup closed, timeout, cancellation).
 * - `invalid_code`: exchanging the sign-in code failed.
 * - `session_invalid`, `targets_mismatch`: only from `verifySession()`.
 * - `unavailable`: only from `verifySession()`: the API could not be reached, failed (5xx) or rate limited the request.
 */
export type SponsorkitErrorCode =
  | "invalid_config"
  | "disabled"
  | "popup_blocked"
  | "access_denied"
  | "invalid_state"
  | "provider_error"
  | "invalid_code"
  | "session_invalid"
  | "targets_mismatch"
  | "unavailable";

/** The only error type thrown by the SDK. Check {@link SponsorkitError.code}. */
export class SponsorkitError extends Error {
  /** Machine-readable error code. */
  readonly code: SponsorkitErrorCode;

  constructor(code: SponsorkitErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options);
    this.name = "SponsorkitError";
    this.code = code;
  }
}

/** True if `error` is a {@link SponsorkitError} (optionally with the given code). */
export function isSponsorkitError(error: unknown, code?: SponsorkitErrorCode): error is SponsorkitError {
  return error instanceof SponsorkitError && (code === undefined || error.code === code);
}
