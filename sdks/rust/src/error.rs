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
    /// unknown mock preset, invalid checkout options, (dev-time check) a
    /// target that does not exist, or a local environment the SDK cannot work
    /// in (an unwritable storage directory, no secure random source).
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
    /// The API rejected the code exchange (`400 invalid_code`).
    InvalidCode,
    /// Sign-in was cancelled through [`crate::SignInOptions::cancel`], or the
    /// user abandoned it (e.g. nothing was entered at the paste-back prompt).
    Cancelled,
    /// Sign-in exceeded [`crate::Options::sign_in_timeout`] (default 300 s).
    Timeout,
    /// The API could not be reached, or answered 5xx, 429 or something
    /// unexpected, during `sign_in`, `open_checkout`'s sign-in or
    /// `verify_session`. [`Error::retry_after`] carries the API's
    /// `Retry-After`, when it sent one. `get_financial_contribution` never
    /// returns it.
    NetworkError,
    /// The session token is invalid. Only returned by [`crate::server::verify_session`].
    SessionInvalid,
    /// The session is bound to different targets. Only returned by [`crate::server::verify_session`].
    TargetsMismatch,
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
            ErrorCode::Cancelled => "cancelled",
            ErrorCode::Timeout => "timeout",
            ErrorCode::NetworkError => "network_error",
            ErrorCode::SessionInvalid => "session_invalid",
            ErrorCode::TargetsMismatch => "targets_mismatch",
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
    retry_after: Option<u64>,
}

impl Error {
    /// Creates an error with the given code and human-readable message.
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Error { code, message: message.into(), retry_after: None }
    }

    /// The machine-readable error code.
    pub fn code(&self) -> ErrorCode {
        self.code
    }

    /// The human-readable message.
    pub fn message(&self) -> &str {
        &self.message
    }

    /// For [`ErrorCode::NetworkError`]: how long the API asked to wait before
    /// retrying (its `Retry-After` header, in whole seconds), if it sent one.
    pub fn retry_after(&self) -> Option<std::time::Duration> {
        self.retry_after.map(std::time::Duration::from_secs)
    }

    pub(crate) fn network(message: impl Into<String>, retry_after: Option<u64>) -> Self {
        Error { code: ErrorCode::NetworkError, message: message.into(), retry_after }
    }

    pub(crate) fn invalid_config(message: impl Into<String>) -> Self {
        Error::new(ErrorCode::InvalidConfig, message)
    }

    pub(crate) fn disabled() -> Self {
        Error::new(ErrorCode::Disabled, "Sponsorkit is disabled (SPONSORKIT_DISABLE is set)")
    }

    /// A local environment problem (storage, randomness, HTTP client setup).
    pub(crate) fn environment(message: impl Into<String>) -> Self {
        Error::new(ErrorCode::InvalidConfig, message)
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
