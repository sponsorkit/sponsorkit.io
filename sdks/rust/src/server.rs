//! Backend verification (SPEC §6.4): check a session token your frontend sent you.
//!
//! ```no_run
//! # async fn run(token: &str) -> Result<(), sponsorkit::Error> {
//! use sponsorkit::{Targets, server::verify_session};
//! let fc = verify_session(token, &Targets::github("octocat")).await?;
//! let supporter = fc.signed_in && !fc.active().is_empty();
//! # Ok(()) }
//! ```

use crate::client::{DEFAULT_REQUEST_TIMEOUT, http_client, validate_base_url, with_timeout};
use crate::error::{Error, ErrorCode, Result};
use crate::signin::retry_after_secs;
use crate::targets::Targets;
use crate::types::ContributionResult;

/// Options for [`verify_session_with`].
#[derive(Debug, Clone, Default)]
pub struct VerifyOptions {
    /// API origin. Default [`crate::DEFAULT_API_BASE_URL`] (`https://api.sponsorkit.io`);
    /// an empty string counts as unset.
    pub api_base_url: Option<String>,
    /// HTTP client to reuse (connection pooling). Default: a new client.
    pub http_client: Option<reqwest::Client>,
    /// Timeout for the request, including reading the body. Default
    /// [`crate::DEFAULT_REQUEST_TIMEOUT`] (30 s); `Some(Duration::ZERO)`
    /// disables it. Exceeding it fails with `network_error`.
    pub request_timeout: Option<std::time::Duration>,
}

/// Verifies a session token against `https://api.sponsorkit.io` and returns its live result.
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
/// could not be verified: the API is unreachable, did not answer within the
/// request timeout, or answered 5xx, 429 or something unexpected. On 429, [`Error::retry_after`] carries the
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
    let req = http
        .get(format!("{base}/api/v1/contributions"))
        .bearer_auth(token.trim())
        .header(reqwest::header::ACCEPT, "application/json");
    let res = with_timeout(req, options.request_timeout.unwrap_or(DEFAULT_REQUEST_TIMEOUT))
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

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::*;

    #[tokio::test]
    async fn verify_session_honours_request_timeout() {
        // Accepts the connection and never answers.
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let mut held = Vec::new();
            while let Ok((s, _)) = listener.accept().await {
                held.push(s);
            }
        });
        let started = Instant::now();
        let err = verify_session_with(
            "sks_x",
            &Targets::github("octocat"),
            VerifyOptions {
                api_base_url: Some(format!("http://127.0.0.1:{port}")),
                request_timeout: Some(Duration::from_millis(300)),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
        assert_eq!(err.code(), ErrorCode::NetworkError, "{err}");
        assert!(started.elapsed() < Duration::from_secs(5));
    }
}
