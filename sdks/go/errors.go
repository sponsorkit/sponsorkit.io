package sponsorkit

import (
	"errors"
	"fmt"
)

// ErrorCode is the machine-readable code carried by every *Error (PROTOCOL §7).
type ErrorCode string

// Error codes. Network and server problems never surface as errors from
// GetFinancialContribution; see the package documentation for the full contract.
const (
	// CodeInvalidConfig: missing or invalid configuration, including targets that
	// do not exist (dev-time check) and invalid checkout options.
	CodeInvalidConfig ErrorCode = "invalid_config"
	// CodeDisabled: Sponsorkit is disabled with SPONSORKIT_DISABLE.
	CodeDisabled ErrorCode = "disabled"
	// CodePopupBlocked is used by browser SDKs only. It is listed for completeness.
	CodePopupBlocked ErrorCode = "popup_blocked"
	// CodeAccessDenied: the user denied access at the provider. Also used when the
	// sign-in is abandoned (cancelled context or the 5-minute loopback timeout).
	CodeAccessDenied ErrorCode = "access_denied"
	// CodeInvalidState: the sign-in state expired or was invalid.
	CodeInvalidState ErrorCode = "invalid_state"
	// CodeProviderError: the provider failed during sign-in.
	CodeProviderError ErrorCode = "provider_error"
	// CodeInvalidCode: exchanging the sign-in code failed (malformed, expired,
	// wrong verifier, or Sponsorkit could not be reached).
	CodeInvalidCode ErrorCode = "invalid_code"
	// CodeSessionInvalid: only from VerifySession. The token is invalid or expired.
	CodeSessionInvalid ErrorCode = "session_invalid"
	// CodeTargetsMismatch: only from VerifySession. The session belongs to a
	// different target set.
	CodeTargetsMismatch ErrorCode = "targets_mismatch"
	// CodeUnavailable: only from VerifySession. Sponsorkit could not be reached,
	// failed (5xx) or rate limited the request.
	CodeUnavailable ErrorCode = "unavailable"
)

// Error is the only error type returned by this package. Use errors.As to
// inspect Code:
//
//	var skErr *sponsorkit.Error
//	if errors.As(err, &skErr) && skErr.Code == sponsorkit.CodeDisabled { ... }
type Error struct {
	// Code is the machine-readable error code.
	Code ErrorCode
	// Message is a human-readable description.
	Message string
	// Err is the underlying cause, if any (for example context.Canceled).
	Err error
}

func (e *Error) Error() string {
	msg := e.Message
	if msg == "" {
		msg = string(e.Code)
	}
	if e.Err != nil {
		return fmt.Sprintf("sponsorkit: %s: %s: %v", e.Code, msg, e.Err)
	}
	return fmt.Sprintf("sponsorkit: %s: %s", e.Code, msg)
}

// Unwrap returns the underlying cause.
func (e *Error) Unwrap() error { return e.Err }

// Is reports whether target is an *Error with the same Code, so that
// errors.Is(err, &sponsorkit.Error{Code: sponsorkit.CodeDisabled}) works.
func (e *Error) Is(target error) bool {
	var t *Error
	if errors.As(target, &t) {
		return t.Code == e.Code && t.Message == "" && t.Err == nil
	}
	return false
}

// ErrorCodeOf returns the Code of err if it is (or wraps) an *Error, and "" otherwise.
func ErrorCodeOf(err error) ErrorCode {
	var e *Error
	if errors.As(err, &e) {
		return e.Code
	}
	return ""
}

func newError(code ErrorCode, msg string, cause error) *Error {
	return &Error{Code: code, Message: msg, Err: cause}
}
