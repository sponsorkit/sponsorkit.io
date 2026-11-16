//! The nag helper (SPEC §7.5).

use std::time::Duration;

use crate::client::{GetOptions, Sponsorkit, process};
use crate::platform::is_interactive;
use crate::storage::NagState;
use crate::time::{now_iso, now_ms, parse_iso};
use crate::types::ContributionResult;

/// Configuration for [`Sponsorkit::nag`].
#[derive(Debug, Clone)]
pub struct NagOptions {
    /// A stable id for this nag (several nags can coexist).
    pub id: String,
    /// Due after this many runs (processes) since it was last shown.
    pub every: u64,
    /// Or due when it was last shown at least this long ago. Use
    /// [`crate::parse_iso_duration`] for ISO-8601 strings such as `"P7D"`.
    pub or_every: Option<Duration>,
}

impl NagOptions {
    /// A nag due every `every` runs.
    pub fn new(id: impl Into<String>, every: u64) -> Self {
        NagOptions { id: id.into(), every, or_every: None }
    }

    /// Also due when last shown at least `period` ago.
    pub fn or_every(mut self, period: Duration) -> Self {
        self.or_every = Some(period);
        self
    }
}

/// Options for [`Nag::due_with`].
#[derive(Debug, Clone, Copy, Default)]
pub struct DueOptions {
    /// Bypasses the TTY, `CI` and `SPONSORKIT_NO_NAG` checks (not `SPONSORKIT_DISABLE`).
    pub force: bool,
}

/// A nag created by [`Sponsorkit::nag`].
#[derive(Debug, Clone)]
pub struct Nag {
    sk: Sponsorkit,
    options: NagOptions,
}

impl Sponsorkit {
    /// Creates a nag helper.
    ///
    /// ```no_run
    /// # async fn run(sk: sponsorkit::Sponsorkit) {
    /// use sponsorkit::{CheckoutOptions, Frequency, NagOptions};
    /// let nag = sk.nag(NagOptions::new("my-cli", 10).or_every(sponsorkit::parse_iso_duration("P7D").unwrap()));
    /// if nag.due(|fc| fc.active().is_empty()).await {
    ///     let url = sk.checkout_url(&CheckoutOptions { frequency: Some(Frequency::Monthly), ..Default::default() }).unwrap();
    ///     eprintln!("Enjoying my-cli? Support it: {url}");
    ///     nag.shown().await;
    /// }
    /// # }
    /// ```
    pub fn nag(&self, options: NagOptions) -> Nag {
        Nag { sk: self.clone(), options }
    }
}

impl Nag {
    /// `predicate && (runs >= every || since(last_shown) >= or_every)`.
    ///
    /// The run counter goes up once per process on the first call (even when
    /// the result is false). Always false when `SPONSORKIT_DISABLE`,
    /// `SPONSORKIT_NO_NAG` or `CI` is set or stdout/stderr is not a terminal.
    /// Never signs in. Errors (e.g. the dev-time target check) read as false.
    pub async fn due(&self, predicate: impl FnOnce(&ContributionResult) -> bool) -> bool {
        self.due_with(predicate, DueOptions::default()).await
    }

    /// [`Nag::due`] with options (`force`).
    pub async fn due_with(&self, predicate: impl FnOnce(&ContributionResult) -> bool, options: DueOptions) -> bool {
        let sk = &self.sk;
        if sk.inner.disabled {
            return false;
        }
        let id = &self.options.id;
        let key = format!("{}:{}", sk.inner.hash, id);
        // Mock mode keeps everything in memory, per instance (PROTOCOL §7.1 item 14).
        let first_run = if sk.inner.mock.is_some() {
            sk.inner.mock_nag_counted.lock().unwrap_or_else(|e| e.into_inner()).insert(key)
        } else {
            process().nag_counted.insert(key)
        };
        if first_run {
            self.update(|n| n.runs += 1);
        }
        if !options.force
            && (sk.env_set("SPONSORKIT_NO_NAG")
                || sk.env_set("CI")
                || !sk.inner.interactive.unwrap_or_else(is_interactive))
        {
            return false;
        }
        let Ok(fc) = sk.get_financial_contribution(GetOptions::default()).await else {
            return false;
        };
        if !predicate(&fc) {
            return false;
        }
        let state = self.state();
        if state.runs >= self.options.every {
            return true;
        }
        match (self.options.or_every, state.last_shown.as_deref().and_then(parse_iso)) {
            (Some(period), Some(last)) => now_ms() - last >= period.as_millis() as i64,
            _ => false,
        }
    }

    /// Records that the nag was shown: resets the run counter and `last_shown`.
    pub async fn shown(&self) {
        if self.sk.inner.disabled {
            return;
        }
        self.update(|n| {
            n.runs = 0;
            n.last_shown = Some(now_iso());
        });
    }

    fn state(&self) -> NagState {
        let id = &self.options.id;
        if self.sk.inner.mock.is_some() {
            return self
                .sk
                .inner
                .mock_nags
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .get(id)
                .cloned()
                .unwrap_or_default();
        }
        self.sk.storage().read().nags.get(id).cloned().unwrap_or_default()
    }

    fn update(&self, f: impl FnOnce(&mut NagState)) {
        let id = self.options.id.clone();
        if self.sk.inner.mock.is_some() {
            f(self.sk.inner.mock_nags.lock().unwrap_or_else(|e| e.into_inner()).entry(id).or_default());
            return;
        }
        // Nag bookkeeping must never break the host app.
        let _ = self.sk.storage().update(|s| f(s.nags.entry(id).or_default()));
    }
}
