//! Stateless checkout (SPEC §7.3, PROTOCOL §4.6).

use std::collections::HashMap;
use std::time::{Duration, Instant};

use tokio_util::sync::CancellationToken;

use crate::client::{GetOptions, SignInMethod, Sponsorkit};
use crate::error::{Error, Result};
use crate::mock::mock_checkout_contribution;
use crate::signin::{CodeError, StartPage};
use crate::targets::Provider;
use crate::types::{CheckoutOutcome, ContributionResult, Frequency};

/// The default time `open_checkout` waits for a contribution (10 minutes).
pub const DEFAULT_CHECKOUT_TIMEOUT: Duration = Duration::from_secs(600);

/// Options for [`Sponsorkit::open_checkout`] and [`Sponsorkit::checkout_url`].
///
/// `timeout`, `poll_interval`, `cancel` and `sign_in_method` only apply to `open_checkout`.
#[derive(Debug, Clone, Default)]
pub struct CheckoutOptions {
    /// Preferred provider. The checkout page never silently switches provider.
    pub provider: Option<Provider>,
    /// Suggested amount in minor units (e.g. `500` = 5.00).
    pub amount: Option<i64>,
    /// ISO 4217 currency, e.g. `"USD"`. GitHub only accepts USD.
    pub currency: Option<String>,
    /// Suggested frequency.
    pub frequency: Option<Frequency>,
    /// How long to wait for the contribution to show up once the checkout
    /// page is open (the polling phase). Default 10 minutes. Signing in first
    /// is bounded by [`crate::Options::sign_in_timeout`] instead.
    pub timeout: Option<Duration>,
    /// Overrides the instance's `checkout_poll_interval` for this call.
    pub poll_interval: Option<Duration>,
    /// Stops waiting, in the sign-in or the polling phase; `open_checkout`
    /// then resolves [`CheckoutOutcome::Unknown`]. Dropping the
    /// `open_checkout` future also stops it (without a result).
    pub cancel: Option<CancellationToken>,
    /// Overrides the instance's sign-in method when the user is signed out.
    pub sign_in_method: Option<SignInMethod>,
}

impl Sponsorkit {
    /// PROTOCOL §7.1 item 16: an unconfigured provider, a non-positive amount
    /// or a malformed currency is `invalid_config`. (Frequencies are an enum.)
    fn validate_checkout(&self, o: &CheckoutOptions) -> Result<()> {
        if let Some(p) = o.provider {
            if !self.has_provider(p) {
                return Err(Error::invalid_config(format!("{p} is not one of the configured targets")));
            }
        }
        if let Some(a) = o.amount {
            if a <= 0 {
                return Err(Error::invalid_config(format!("amount must be a positive number of minor units, got {a}")));
            }
        }
        if let Some(c) = &o.currency {
            if c.len() != 3 || !c.bytes().all(|b| b.is_ascii_alphabetic()) {
                return Err(Error::invalid_config(format!(
                    "currency must be an ISO 4217 code such as \"USD\", got \"{c}\""
                )));
            }
        }
        Ok(())
    }

    fn checkout_params(&self, o: &CheckoutOptions) -> Vec<(String, String)> {
        let mut q = vec![("targets".to_string(), self.inner.targets.param())];
        if let Some(p) = o.provider {
            q.push(("provider".into(), p.as_str().into()));
        }
        if let Some(a) = o.amount {
            q.push(("amount".into(), a.to_string()));
        }
        if let Some(c) = o.currency.as_deref() {
            q.push(("currency".into(), c.to_ascii_uppercase()));
        }
        if let Some(f) = o.frequency {
            q.push(("frequency".into(), f.as_str().into()));
        }
        q
    }

    /// A link to the `/checkout` page for these targets, without sign-in.
    ///
    /// Synchronous and offline (no network, no disk): suitable for nags,
    /// READMEs and `--help` output.
    ///
    /// Fails with `invalid_config` when `provider` is not configured, `amount`
    /// is not positive or `currency` is not a three-letter ISO 4217 code.
    pub fn checkout_url(&self, options: &CheckoutOptions) -> Result<String> {
        self.validate_checkout(options)?;
        let mut url =
            reqwest::Url::parse(&format!("{}/checkout", self.inner.api_base_url)).expect("validated base URL");
        url.query_pairs_mut().extend_pairs(self.checkout_params(options));
        Ok(url.to_string())
    }

    /// Sends the supporter to contribute and waits until the contribution shows up.
    ///
    /// 1. When signed out, signs in first (through the `/checkout` page) so the
    ///    new contribution can be detected.
    /// 2. Opens `/checkout`, which picks an eligible provider (PROTOCOL §6).
    /// 3. Polls `get_financial_contribution` (cache bypassed) every
    ///    `poll_interval` until a new or changed contribution appears.
    ///
    /// Resolves [`CheckoutOutcome::Unknown`] when the polling `timeout`
    /// elapses or on cancellation (in either phase); it does not fail for
    /// those. Errors: `disabled`, `invalid_config` (see
    /// [`Sponsorkit::checkout_url`]), and the sign-in errors of
    /// [`Sponsorkit::sign_in`], including `timeout` when signing in exceeds
    /// [`crate::Options::sign_in_timeout`].
    pub async fn open_checkout(&self, options: CheckoutOptions) -> Result<CheckoutOutcome> {
        self.ensure_enabled()?;
        self.validate_checkout(&options)?;
        if let Some(mut m) = self.mock_state() {
            let provider = options.provider.filter(|p| self.has_provider(*p));
            let c = mock_checkout_contribution(
                &self.inner.targets,
                provider,
                options.amount,
                options.currency.as_deref(),
                options.frequency,
            );
            m.signed_in = true;
            m.contributions.retain(|x| x.id != c.id);
            m.contributions.push(c.clone());
            return Ok(CheckoutOutcome::Contributed { contribution: Box::new(c) });
        }
        self.dev_check().await?;
        let never = CancellationToken::new();
        let cancel = options.cancel.as_ref().unwrap_or(&never);
        let timeout = options.timeout.unwrap_or(DEFAULT_CHECKOUT_TIMEOUT);
        let interval = options.poll_interval.unwrap_or(self.inner.poll_interval).max(Duration::from_millis(10));
        let params = self.checkout_params(&options);

        let baseline: ContributionResult = if self.is_signed_in() {
            let baseline = match self.storage().read().cache {
                Some(c) => c.result,
                None => self.get_financial_contribution(GetOptions::fresh()).await?,
            };
            let url = self.checkout_url(&options)?;
            let opened = tokio::select! {
                r = self.open_url(url.clone()) => r,
                _ = cancel.cancelled() => return Ok(CheckoutOutcome::Unknown),
            };
            if opened.is_err() {
                eprintln!("\nOpen this URL in a browser to contribute:\n\n  {url}\n");
            }
            baseline
        } else {
            let method = options.sign_in_method.unwrap_or(self.inner.sign_in_method);
            let (code, verifier) =
                match self.obtain_code(StartPage::Checkout(params), Vec::new(), method, Some(cancel)).await {
                    Ok(v) => v,
                    Err(CodeError::Cancelled) => return Ok(CheckoutOutcome::Unknown),
                    Err(e) => return Err(e.into()),
                };
            self.exchange(&code, &verifier).await?
        };
        // The timeout covers only the polling phase (PROTOCOL §7.1 item 15).
        let started = Instant::now();

        let before: HashMap<String, serde_json::Value> = baseline
            .contributions
            .iter()
            .map(|c| (c.id.clone(), serde_json::to_value(c).unwrap_or_default()))
            .collect();
        loop {
            if cancel.is_cancelled() || started.elapsed() >= timeout {
                return Ok(CheckoutOutcome::Unknown);
            }
            let result = tokio::select! {
                r = self.get_financial_contribution(GetOptions::fresh()) => r?,
                _ = cancel.cancelled() => return Ok(CheckoutOutcome::Unknown),
            };
            let changed = result
                .contributions
                .into_iter()
                .find(|c| before.get(&c.id) != Some(&serde_json::to_value(c).unwrap_or_default()));
            if let Some(contribution) = changed {
                return Ok(CheckoutOutcome::Contributed { contribution: Box::new(contribution) });
            }
            let remaining = timeout.saturating_sub(started.elapsed());
            if remaining.is_zero() {
                return Ok(CheckoutOutcome::Unknown);
            }
            tokio::select! {
                _ = tokio::time::sleep(interval.min(remaining)) => {}
                _ = cancel.cancelled() => return Ok(CheckoutOutcome::Unknown),
            }
        }
    }
}
