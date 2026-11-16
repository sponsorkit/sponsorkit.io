package sponsorkit

import (
	"errors"
	"fmt"
	"time"
)

// ErrorCode is the machine-readable code carried by every *Error (PROTOCOL §7).
type ErrorCode string

// Error codes (PROTOCOL §7). Network and server problems never surface as
// errors from GetFinancialContribution; see the package documentation for the
// full contract.
const (
	// CodeInvalidConfig: missing or invalid configuration, including targets that
	// do not exist (dev-time check) and invalid checkout options.
	CodeInvalidConfig ErrorCode = "invalid_config"
	// CodeDisabled: Sponsorkit is disabled with SPONSORKIT_DISABLE.
	CodeDisabled ErrorCode = "disabled"
	// CodePopupBlocked is used by browser SDKs only. It is listed for completeness.
	CodePopupBlocked ErrorCode = "popup_blocked"
	// CodeAccessDenied: the user denied access at the provider.
	CodeAccessDenied ErrorCode = "access_denied"
	// CodeInvalidState: the sign-in state expired or was invalid.
	CodeInvalidState ErrorCode = "invalid_state"
	// CodeProviderError: the provider failed during sign-in.
	CodeProviderError ErrorCode = "provider_error"
	// CodeInvalidCode: the API rejected the sign-in code exchange (400
	// invalid_code: malformed, expired or wrong verifier).
	CodeInvalidCode ErrorCode = "invalid_code"
	// CodeCancelled: the sign-in was abandoned or its context.Context was
	// cancelled. Err wraps the context error when there is one.
	CodeCancelled ErrorCode = "cancelled"
	// CodeTimeout: the sign-in took longer than Options.SignInTimeout (default
	// 5 minutes).
	CodeTimeout ErrorCode = "timeout"
	// CodeNetworkError: Sponsorkit could not be reached, or answered 5xx, 429 or
	// an unexpected response, during SignIn or VerifySession. RetryAfter is set
	// when the API sent Retry-After.
	CodeNetworkError ErrorCode = "network_error"
	// CodeSessionInvalid: only from VerifySession. The token is invalid or expired.
	CodeSessionInvalid ErrorCode = "session_invalid"
	// CodeTargetsMismatch: only from VerifySession. The session belongs to a
	// different target set.
	CodeTargetsMismatch ErrorCode = "targets_mismatch"
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
	// RetryAfter is how long the API asked the caller to wait (its Retry-After
	// header) for a network_error caused by a 429 response. It is nil when the
	// API sent no Retry-After.
	RetryAfter *time.Duration
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
