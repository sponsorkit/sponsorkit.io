//! The error type returned by every fallible Sponsorkit operation.

use std::fmt;

/// A stable, machine-readable error code (PROTOCOL §7).
///
/// [`ErrorCode::as_str`] returns the wire spelling (`"invalid_config"`, ...),
/// which is identical in every Sponsorkit SDK.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum ErrorCode {
    /// Missing or invalid configuration: no targets, a malformed target, an
    /// unknown mock preset, or (dev-time check) a target that does not exist.
    InvalidConfig,
    /// Sponsorkit is disabled through `SPONSORKIT_DISABLE`.
    Disabled,
    /// A browser popup was blocked. Only the browser SDK produces it; it is
    /// listed for parity with the other SDKs.
    PopupBlocked,
    /// The supporter declined access at the provider.
    AccessDenied,
    /// The OAuth state expired or could not be verified.
    InvalidState,
    /// The provider failed during sign-in.
    ProviderError,
    /// Exchanging the sign-in code failed (malformed, expired or wrong verifier).
    InvalidCode,
    /// The session token is invalid. Only returned by [`crate::server::verify_session`].
    SessionInvalid,
    /// The session is bound to different targets. Only returned by [`crate::server::verify_session`].
    TargetsMismatch,
    /// Sign-in did not complete in time (loopback sign-in waits 5 minutes), or was cancelled.
    Timeout,
    /// An unexpected network, server or local I/O failure in an operation that
    /// cannot degrade gracefully (sign-in, `verify_session`, writing storage).
    /// `get_financial_contribution` never returns it.
    Internal,
}

impl ErrorCode {
    /// The wire spelling of this code, e.g. `"invalid_config"`.
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::InvalidConfig => "invalid_config",
            ErrorCode::Disabled => "disabled",
            ErrorCode::PopupBlocked => "popup_blocked",
            ErrorCode::AccessDenied => "access_denied",
            ErrorCode::InvalidState => "invalid_state",
            ErrorCode::ProviderError => "provider_error",
            ErrorCode::InvalidCode => "invalid_code",
            ErrorCode::SessionInvalid => "session_invalid",
            ErrorCode::TargetsMismatch => "targets_mismatch",
            ErrorCode::Timeout => "timeout",
            ErrorCode::Internal => "internal",
        }
    }

    /// Parses a sign-in error delivered to the loopback callback (`?error=<code>`).
    pub(crate) fn from_callback(s: &str) -> ErrorCode {
        match s {
            "access_denied" => ErrorCode::AccessDenied,
            "invalid_state" => ErrorCode::InvalidState,
            _ => ErrorCode::ProviderError,
        }
    }
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// The error type of this crate (`SponsorkitError` in the other SDKs).
///
/// Match on [`Error::code`] rather than on the message, which is meant for humans.
#[derive(Debug, Clone)]
pub struct Error {
    code: ErrorCode,
    message: String,
}

impl Error {
    /// Creates an error with the given code and human-readable message.
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Error { code, message: message.into() }
    }

    /// The machine-readable error code.
    pub fn code(&self) -> ErrorCode {
        self.code
    }

    /// The human-readable message.
    pub fn message(&self) -> &str {
        &self.message
    }

    pub(crate) fn invalid_config(message: impl Into<String>) -> Self {
        Error::new(ErrorCode::InvalidConfig, message)
    }

    pub(crate) fn disabled() -> Self {
        Error::new(ErrorCode::Disabled, "Sponsorkit is disabled (SPONSORKIT_DISABLE is set)")
    }

    pub(crate) fn internal(message: impl Into<String>) -> Self {
        Error::new(ErrorCode::Internal, message)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "sponsorkit: {} ({})", self.message, self.code)
    }
}

impl std::error::Error for Error {}

/// Shorthand for `std::result::Result<T, sponsorkit::Error>`.
pub type Result<T, E = Error> = std::result::Result<T, E>;
