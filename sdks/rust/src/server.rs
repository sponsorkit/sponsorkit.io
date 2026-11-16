//! Backend verification (SPEC §6.4): check a session token your frontend sent you.
//!
//! ```no_run
//! # async fn run(token: &str) -> Result<(), sponsorkit::Error> {
//! use sponsorkit::{Targets, server::verify_session};
//! let fc = verify_session(token, &Targets::github("octocat")).await?;
//! let supporter = fc.signed_in && !fc.active().is_empty();
//! # Ok(()) }
//! ```

use crate::client::{http_client, validate_base_url};
use crate::error::{Error, ErrorCode, Result};
use crate::signin::retry_after_secs;
use crate::targets::Targets;
use crate::types::ContributionResult;

/// Options for [`verify_session_with`].
#[derive(Debug, Clone, Default)]
pub struct VerifyOptions {
    /// API origin. Default `https://sponsorkit.io`.
    pub api_base_url: Option<String>,
    /// HTTP client to reuse (connection pooling). Default: a new client.
    pub http_client: Option<reqwest::Client>,
}

/// Verifies a session token against `https://sponsorkit.io` and returns its live result.
///
/// See [`verify_session_with`].
pub async fn verify_session(token: &str, targets: &Targets) -> Result<ContributionResult> {
    verify_session_with(token, targets, VerifyOptions::default()).await
}

/// Calls `GET /api/v1/contributions` with the token and checks that the
/// session is bound to exactly `targets` (canonical comparison). Touches no
/// local storage and never serves a cache.
///
/// Errors: `invalid_config` (bad targets or `api_base_url`),
/// `session_invalid`, `targets_mismatch`, and `network_error` when the answer
/// could not be verified: the API is unreachable or answered 5xx, 429 or
/// something unexpected. On 429, [`Error::retry_after`] carries the
/// `Retry-After` the API sent.
pub async fn verify_session_with(token: &str, targets: &Targets, options: VerifyOptions) -> Result<ContributionResult> {
    let expected = targets.canonical()?.param();
    let base = validate_base_url(options.api_base_url.as_deref())?;
    let http = match options.http_client {
        Some(c) => c,
        None => http_client()?,
    };
    if token.trim().is_empty() {
        return Err(Error::new(ErrorCode::SessionInvalid, "Empty session token"));
    }
    let res = http
        .get(format!("{base}/api/v1/contributions"))
        .bearer_auth(token.trim())
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|e| Error::network(format!("Cannot reach Sponsorkit: {e}"), None))?;
    let status = res.status();
    if status.as_u16() == 401 {
        return Err(Error::new(ErrorCode::SessionInvalid, "The session token is invalid or expired"));
    }
    if !status.is_success() {
        return Err(Error::network(format!("Sponsorkit answered HTTP {status}"), retry_after_secs(res.headers())));
    }
    let result: ContributionResult =
        res.json().await.map_err(|e| Error::network(format!("Unexpected response from Sponsorkit: {e}"), None))?;
    let actual = result.targets.join(",");
    if actual != expected {
        return Err(Error::new(
            ErrorCode::TargetsMismatch,
            format!("The session is bound to \"{actual}\", expected \"{expected}\""),
        ));
    }
    Ok(result)
}
