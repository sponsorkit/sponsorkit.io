//! # Sponsorkit
//!
//! Build GitHub Sponsors and Open Collective contributions into your Rust app
//! or CLI. No account, no API key: name the account(s) you receive
//! contributions on, ask what the current user contributes, and send them to
//! contribute.
//!
//! ```no_run
//! use sponsorkit::{CheckoutOptions, Frequency, GetOptions, Options, Sponsorkit};
//!
//! # async fn run() -> Result<(), sponsorkit::Error> {
//! let sk = Sponsorkit::new(Options {
//!     github: Some("octocat".into()),
//!     opencollective: Some("sponsorkit".into()),
//!     app_name: Some("my-cli".into()),
//!     ..Default::default()
//! })?;
//!
//! let fc = sk.get_financial_contribution(GetOptions::default()).await?;
//! let supports = fc.active().iter().any(|c| c.amount.currency == "USD" && c.amount.value >= 500);
//! if fc.signed_in && !supports {
//!     println!("Support my-cli: {}", sk.checkout_url(&CheckoutOptions::default()));
//! }
//!
//! // Interactive: sign in (if needed), open the checkout, wait for the contribution.
//! let outcome = sk
//!     .open_checkout(CheckoutOptions { frequency: Some(Frequency::Monthly), amount: Some(500), ..Default::default() })
//!     .await?;
//! # Ok(()) }
//! ```
//!
//! ## Guarantees
//!
//! * [`Sponsorkit::get_financial_contribution`] never fails because Sponsorkit,
//!   a provider or the network is down; it serves the local cache instead
//!   (SPEC §7.2). Its only error is `invalid_config` from the dev-time check.
//! * `SPONSORKIT_DISABLE=1` turns the SDK into a no-op without network or disk access.
//! * Mock mode ([`Options::mock`] or `SPONSORKIT_MOCK`) gives deterministic data for tests.
//!
//! ## Cancellation
//!
//! [`Sponsorkit::open_checkout`] accepts a [`CancellationToken`] in
//! [`CheckoutOptions::cancel`]; cancelling resolves
//! [`CheckoutOutcome::Unknown`]. Dropping the future (e.g. through
//! `tokio::time::timeout` or `select!`) also stops it, without a result.
//!
//! ## Runtime
//!
//! The SDK needs a Tokio runtime (current-thread or multi-thread). Local
//! storage uses small synchronous file operations.

#![warn(missing_docs)]

mod checkout;
mod client;
mod error;
mod mock;
mod nag;
mod pkce;
mod platform;
pub mod server;
mod signin;
mod storage;
mod targets;
mod time;
mod types;

pub use checkout::{CheckoutOptions, DEFAULT_CHECKOUT_TIMEOUT};
pub use client::{
    BoxFuture, DEFAULT_API_BASE_URL, DEFAULT_CACHE_TTL, DEFAULT_CHECKOUT_POLL_INTERVAL, GetOptions, MIN_CACHE_TTL,
    OpenBrowserHook, Options, PromptForCodeHook, SignInMethod, Sponsorkit,
};
pub use error::{Error, ErrorCode, Result};
pub use mock::{MOCK_PRESETS_JSON, Mock, MockPreset, mock_result};
pub use nag::{DueOptions, Nag, NagOptions};
pub use pkce::{base64url, code_challenge, generate_verifier};
pub use signin::{LOOPBACK_TIMEOUT, SignInOptions};
pub use targets::{Provider, Target, TargetSet, Targets};
pub use time::parse_iso_duration;
pub use tokio_util::sync::CancellationToken;
pub use types::{
    CheckoutOutcome, Contribution, ContributionResult, Flag, Frequency, Identity, Kind, Money, SponsorEntity,
    SponsorType, Status, Supporter, Tier, Via,
};

/// Compiles (and runs) the README examples as doctests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
pub struct ReadmeDoctests;
