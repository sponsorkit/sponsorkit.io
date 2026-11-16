//! The [`Sponsorkit`] client: construction, `get_financial_contribution`, sign-out.

use std::collections::{HashMap, HashSet};
use std::fmt;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use serde_json::Value;

use crate::error::{Error, Result};
use crate::mock::{Mock, MockPreset, MockState};
use crate::platform::is_set;
use crate::storage::{Cache, NagState, Storage, default_storage_dir};
use crate::targets::{Provider, TargetSet, Targets};
use crate::time::{now_iso, now_ms, parse_iso};
use crate::types::ContributionResult;

/// The default API origin.
pub const DEFAULT_API_BASE_URL: &str = "https://sponsorkit.io";
/// The default cache TTL (1 hour).
pub const DEFAULT_CACHE_TTL: Duration = Duration::from_secs(3600);
/// The minimum cache TTL accepted by [`Options::cache_ttl`] (60 s).
pub const MIN_CACHE_TTL: Duration = Duration::from_secs(60);
/// The default interval at which `open_checkout` polls for a new contribution (60 s).
pub const DEFAULT_CHECKOUT_POLL_INTERVAL: Duration = Duration::from_secs(60);
/// The default [`Options::sign_in_timeout`] (300 s).
pub const DEFAULT_SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);

pub(crate) const USER_AGENT: &str = concat!("sponsorkit-rust/", env!("CARGO_PKG_VERSION"));

/// A boxed, sendable future, used by the hook types.
pub type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send + 'static>>;

/// Replacement for opening the system browser: receives the URL to open.
///
/// Return an error when the browser cannot be opened; with
/// [`SignInMethod::Auto`] the SDK then falls back to paste-back sign-in.
pub type OpenBrowserHook = Arc<dyn Fn(String) -> BoxFuture<std::io::Result<()>> + Send + Sync>;

/// Replacement for reading the paste-back code from stdin: receives the
/// `/connect?…&delivery=paste` URL the user has to open and returns the code.
pub type PromptForCodeHook = Arc<dyn Fn(String) -> BoxFuture<std::io::Result<String>> + Send + Sync>;

/// How `sign_in` (and `open_checkout` when signed out) gets the sign-in code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SignInMethod {
    /// Loopback when a browser can be opened, else paste-back (SPEC §6.2).
    #[default]
    Auto,
    /// Open the browser and receive the code on `http://127.0.0.1:<port>/callback`.
    Loopback,
    /// Print a URL and read the code the page displays (headless machines).
    Paste,
}

/// Configuration for [`Sponsorkit::new`]. Use `..Default::default()` for the rest.
///
/// ```
/// let sk = sponsorkit::Sponsorkit::new(sponsorkit::Options {
///     github: Some("octocat".into()),
///     app_name: Some("my-cli".into()),
///     ..Default::default()
/// })?;
/// # Ok::<(), sponsorkit::Error>(())
/// ```
#[derive(Clone, Default)]
pub struct Options {
    /// GitHub Sponsors login that receives contributions.
    pub github: Option<String>,
    /// Open Collective collective slug that receives contributions.
    pub opencollective: Option<String>,
    /// Your app's name, shown on the consent page as "says it is" (max 64 characters).
    pub app_name: Option<String>,
    /// How long a cached result is served without calling the API.
    /// Default 1 hour; values below 60 s are raised to 60 s.
    pub cache_ttl: Option<Duration>,
    /// Mock mode: no network, no disk; deterministic data (SPEC §7.4).
    /// Beats the `SPONSORKIT_MOCK` environment variable.
    pub mock: Option<Mock>,
    /// Storage directory. Default: `$XDG_CONFIG_HOME/sponsorkit` (Linux),
    /// `~/Library/Application Support/sponsorkit` (macOS), `%APPDATA%\sponsorkit` (Windows).
    pub storage_dir: Option<PathBuf>,
    /// API origin (self-hosting, tests). Default `https://sponsorkit.io`.
    pub api_base_url: Option<String>,
    /// Forces a sign-in method. Default [`SignInMethod::Auto`].
    pub sign_in_method: SignInMethod,
    /// How long `sign_in` (and the sign-in phase of `open_checkout`) waits for
    /// the loopback callback or the paste-back code. Exceeding it fails with
    /// `timeout`. Default [`DEFAULT_SIGN_IN_TIMEOUT`] (300 s).
    pub sign_in_timeout: Option<Duration>,
    /// Environment override for `SPONSORKIT_DISABLE`, `SPONSORKIT_MOCK`,
    /// `SPONSORKIT_NO_NAG`, `SPONSORKIT_DEV_CHECKS` and `CI`. When `Some`, it
    /// replaces the process environment for these variables (it is not merged).
    pub env: Option<HashMap<String, String>>,
    /// Forces the dev-time target existence check on or off. Default: on when
    /// `SPONSORKIT_DEV_CHECKS` is set (see [`Options::env`]), otherwise off.
    /// Rust has no implicit development signal (PROTOCOL §7).
    pub dev_checks: Option<bool>,
    /// How often `open_checkout` polls for a new contribution. Default 60 s.
    pub checkout_poll_interval: Option<Duration>,
    /// Overrides terminal detection for the nag helper: `Some(false)` treats
    /// the process as non-interactive (nags never due unless forced),
    /// `Some(true)` as interactive. Default: stdout and stderr must both be terminals.
    pub interactive: Option<bool>,
    /// Replaces opening the system browser (tests, custom UIs).
    pub open_browser: Option<OpenBrowserHook>,
    /// Replaces reading the paste-back code from stdin.
    pub prompt_for_code: Option<PromptForCodeHook>,
    /// Resets per-process memo state (nag runs counted, dev-check memo,
    /// `Retry-After` memo) before constructing, as if the process restarted.
    /// Equivalent to calling [`Sponsorkit::reset_process_state`].
    pub restart: bool,
}

impl fmt::Debug for Options {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Options")
            .field("github", &self.github)
            .field("opencollective", &self.opencollective)
            .field("app_name", &self.app_name)
            .field("cache_ttl", &self.cache_ttl)
            .field("mock", &self.mock)
            .field("storage_dir", &self.storage_dir)
            .field("api_base_url", &self.api_base_url)
            .field("sign_in_method", &self.sign_in_method)
            .field("sign_in_timeout", &self.sign_in_timeout)
            .field("env", &self.env)
            .field("dev_checks", &self.dev_checks)
            .field("checkout_poll_interval", &self.checkout_poll_interval)
            .field("interactive", &self.interactive)
            .field("open_browser", &self.open_browser.as_ref().map(|_| "<hook>"))
            .field("prompt_for_code", &self.prompt_for_code.as_ref().map(|_| "<hook>"))
            .field("restart", &self.restart)
            .finish()
    }
}

/// Options for [`Sponsorkit::get_financial_contribution`].
#[derive(Debug, Clone, Default)]
pub struct GetOptions {
    /// Overrides the instance cache TTL for this call. `Some(Duration::ZERO)`
    /// always asks the API (unless a `Retry-After` is in force).
    pub cache_ttl: Option<Duration>,
}

impl GetOptions {
    /// Options that bypass the cache (`cache_ttl: 0`).
    pub fn fresh() -> Self {
        GetOptions { cache_ttl: Some(Duration::ZERO) }
    }
}

/// Per-process memo state (`restart` resets it).
#[derive(Default)]
pub(crate) struct ProcessState {
    pub nag_counted: HashSet<String>,
    pub dev_checks: HashMap<String, Arc<tokio::sync::OnceCell<Result<()>>>>,
    pub retry_until: HashMap<String, i64>,
}

pub(crate) static PROCESS: LazyLock<Mutex<ProcessState>> = LazyLock::new(|| Mutex::new(ProcessState::default()));

pub(crate) fn process() -> std::sync::MutexGuard<'static, ProcessState> {
    PROCESS.lock().unwrap_or_else(|e| e.into_inner())
}

pub(crate) struct Inner {
    pub targets: TargetSet,
    pub hash: String,
    pub app_name: Option<String>,
    pub cache_ttl: Duration,
    pub api_base_url: String,
    pub storage: Option<Storage>,
    pub disabled: bool,
    pub mock: Option<Mutex<MockState>>,
    pub mock_nags: Mutex<HashMap<String, NagState>>,
    /// Mock mode: nag ids whose run was already counted by this instance.
    pub mock_nag_counted: Mutex<HashSet<String>>,
    pub env: Option<HashMap<String, String>>,
    pub dev_checks: bool,
    pub sign_in_method: SignInMethod,
    pub sign_in_timeout: Duration,
    pub poll_interval: Duration,
    pub interactive: Option<bool>,
    pub open_browser: Option<OpenBrowserHook>,
    pub prompt_for_code: Option<PromptForCodeHook>,
    pub http: reqwest::Client,
}

/// A Sponsorkit client for one target set.
///
/// Cheap to clone (it is an `Arc` inside). See the crate docs for an overview.
#[derive(Clone)]
pub struct Sponsorkit {
    pub(crate) inner: Arc<Inner>,
}

impl fmt::Debug for Sponsorkit {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Sponsorkit")
            .field("targets", &self.inner.targets.param())
            .field("disabled", &self.inner.disabled)
            .field("mock", &self.inner.mock.is_some())
            .field("api_base_url", &self.inner.api_base_url)
            .finish_non_exhaustive()
    }
}

pub(crate) fn validate_base_url(url: Option<&str>) -> Result<String> {
    let raw = url.unwrap_or(DEFAULT_API_BASE_URL).trim().trim_end_matches('/').to_string();
    let parsed =
        reqwest::Url::parse(&raw).map_err(|e| Error::invalid_config(format!("Invalid api_base_url \"{raw}\": {e}")))?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err(Error::invalid_config(format!("api_base_url must be an http(s) origin, got \"{raw}\"")));
    }
    Ok(raw)
}

pub(crate) fn http_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| Error::environment(format!("Cannot create HTTP client: {e}")))
}

/// What a `/contributions` request produced.
enum Fetched {
    Ok(ContributionResult, Option<String>),
    SessionInvalid,
    RateLimited(u64),
    Failed,
}

impl Sponsorkit {
    /// Creates a client. Performs no I/O.
    ///
    /// Fails with `invalid_config` when there is no target, a target is
    /// malformed (even when disabled), the mock preset is unknown, or no
    /// storage directory can be determined.
    pub fn new(options: Options) -> Result<Sponsorkit> {
        if options.restart {
            Sponsorkit::reset_process_state();
        }
        let targets =
            Targets { github: options.github.clone(), opencollective: options.opencollective.clone() }.canonical()?;
        let env = options.env.clone();
        let lookup = |name: &str| -> Option<String> {
            match &env {
                Some(map) => map.get(name).cloned(),
                None => std::env::var(name).ok(),
            }
        };
        let disabled = is_set(lookup("SPONSORKIT_DISABLE").as_deref());
        let dev_checks = options.dev_checks.unwrap_or_else(|| is_set(lookup("SPONSORKIT_DEV_CHECKS").as_deref()));
        let mock = match options.mock.clone() {
            Some(m) => Some(m),
            None => match lookup("SPONSORKIT_MOCK") {
                Some(name) if is_set(Some(&name)) => Some(Mock::Preset(name.trim().parse::<MockPreset>()?)),
                _ => None,
            },
        };
        if let Some(name) = &options.app_name {
            if name.chars().count() > 64 {
                return Err(Error::invalid_config("app_name must be at most 64 characters"));
            }
        }
        let api_base_url = validate_base_url(options.api_base_url.as_deref())?;
        let mock_state = if disabled { None } else { mock.as_ref().map(|m| Mutex::new(MockState::new(&targets, m))) };
        let hash = targets.hash();
        let storage = if disabled || mock_state.is_some() {
            None
        } else {
            let dir = options.storage_dir.clone().or_else(default_storage_dir).ok_or_else(|| {
                Error::invalid_config("Cannot determine a storage directory (no HOME/APPDATA); set storage_dir")
            })?;
            Some(Storage::new(dir, &hash))
        };
        Ok(Sponsorkit {
            inner: Arc::new(Inner {
                hash,
                app_name: options.app_name.clone().filter(|s| !s.is_empty()),
                cache_ttl: options.cache_ttl.unwrap_or(DEFAULT_CACHE_TTL).max(MIN_CACHE_TTL),
                api_base_url,
                storage,
                disabled,
                mock: mock_state,
                mock_nags: Mutex::new(HashMap::new()),
                mock_nag_counted: Mutex::new(HashSet::new()),
                env,
                dev_checks,
                sign_in_method: options.sign_in_method,
                sign_in_timeout: options.sign_in_timeout.unwrap_or(DEFAULT_SIGN_IN_TIMEOUT),
                poll_interval: options.checkout_poll_interval.unwrap_or(DEFAULT_CHECKOUT_POLL_INTERVAL),
                interactive: options.interactive,
                open_browser: options.open_browser.clone(),
                prompt_for_code: options.prompt_for_code.clone(),
                http: http_client()?,
                targets,
            }),
        })
    }

    /// Forgets per-process memo state: which nags were already counted in this
    /// run, the dev-time target check, and `Retry-After` back-offs. Use it in
    /// tests to simulate the next run of the app.
    pub fn reset_process_state() {
        let mut p = process();
        *p = ProcessState::default();
    }

    /// The canonical target set.
    pub fn targets(&self) -> &TargetSet {
        &self.inner.targets
    }

    /// Whether `SPONSORKIT_DISABLE` turned this instance into a no-op.
    pub fn is_disabled(&self) -> bool {
        self.inner.disabled
    }

    /// Whether this instance is in mock mode.
    pub fn is_mock(&self) -> bool {
        self.inner.mock.is_some()
    }

    pub(crate) fn env_set(&self, name: &str) -> bool {
        match &self.inner.env {
            Some(map) => is_set(map.get(name).map(String::as_str)),
            None => is_set(std::env::var(name).ok().as_deref()),
        }
    }

    pub(crate) fn mock_state(&self) -> Option<std::sync::MutexGuard<'_, MockState>> {
        self.inner.mock.as_ref().map(|m| m.lock().unwrap_or_else(|e| e.into_inner()))
    }

    pub(crate) fn storage(&self) -> &Storage {
        self.inner.storage.as_ref().expect("storage exists when neither disabled nor mock")
    }

    pub(crate) fn empty_result(&self) -> ContributionResult {
        ContributionResult::empty(self.inner.targets.strings())
    }

    pub(crate) fn disabled_result(&self) -> ContributionResult {
        ContributionResult { disabled: true, ..self.empty_result() }
    }

    /// Whether a supporter is signed in (a session token is stored). Reads
    /// local storage only; never touches the network.
    pub fn is_signed_in(&self) -> bool {
        if self.inner.disabled {
            return false;
        }
        if let Some(m) = self.mock_state() {
            return m.signed_in;
        }
        self.storage().read().session_token.is_some()
    }

    /// The dev-time existence check (once per process and target set).
    pub(crate) async fn dev_check(&self) -> Result<()> {
        if !self.inner.dev_checks || self.inner.disabled || self.inner.mock.is_some() {
            return Ok(());
        }
        let cell = process().dev_checks.entry(self.inner.targets.param()).or_default().clone();
        cell.get_or_init(|| self.fetch_dev_check()).await.clone()
    }

    async fn fetch_dev_check(&self) -> Result<()> {
        let query: Vec<(&str, &str)> =
            self.inner.targets.targets().iter().map(|t| (t.provider.as_str(), t.account.as_str())).collect();
        let url = format!("{}/api/v1/targets", self.inner.api_base_url);
        let Ok(res) = self.inner.http.get(url).query(&query).send().await else {
            return Ok(()); // offline: skip the check
        };
        if !res.status().is_success() {
            return Ok(());
        }
        let Ok(body) = res.json::<Value>().await else {
            return Ok(());
        };
        let missing: Vec<String> = body["targets"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter(|t| t["exists"] == Value::Bool(false))
                    .filter_map(|t| t["target"].as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default();
        if missing.is_empty() {
            Ok(())
        } else {
            Err(Error::invalid_config(format!(
                "These targets do not exist or have no sponsorship listing: {}",
                missing.join(", ")
            )))
        }
    }

    /// Reports what the current user contributes to the targets (SPEC §7.1).
    ///
    /// Never fails because Sponsorkit, a provider or the network is down: it
    /// then serves the cache (`from_cache: true, stale: true`) or a signed-in
    /// empty result with `stale: true`. Returns the signed-out result when no
    /// one is signed in (without a network call), and clears the session when
    /// the server reports it invalid.
    ///
    /// The only error is `invalid_config` from the dev-time target check.
    pub async fn get_financial_contribution(&self, options: GetOptions) -> Result<ContributionResult> {
        if self.inner.disabled {
            return Ok(self.disabled_result());
        }
        if let Some(m) = self.mock_state() {
            return Ok(m.result(&self.inner.targets));
        }
        self.dev_check().await?;
        let stored = self.storage().read();
        let Some(token) = stored.session_token else {
            return Ok(self.empty_result());
        };
        let ttl = options.cache_ttl.unwrap_or(self.inner.cache_ttl).as_millis() as i64;
        let cache = stored.cache;
        let now = now_ms();
        if let Some(c) = &cache {
            if ttl > 0 && parse_iso(&c.stored_at).is_some_and(|at| now - at < ttl) {
                return Ok(ContributionResult { from_cache: true, ..c.result.clone() });
            }
        }
        let fallback = |cache: Option<Cache>| match cache {
            Some(c) => ContributionResult { from_cache: true, stale: true, ..c.result },
            None => ContributionResult { signed_in: true, stale: true, ..self.empty_result() },
        };
        let param = self.inner.targets.param();
        if process().retry_until.get(&param).is_some_and(|&until| until > now) {
            return Ok(fallback(cache));
        }
        match self.fetch_contributions(&token).await {
            Fetched::Failed => Ok(fallback(cache)),
            Fetched::RateLimited(secs) => {
                process().retry_until.insert(param, retry_deadline(now_ms(), secs));
                Ok(fallback(cache))
            }
            Fetched::SessionInvalid => {
                let _ = self.storage().update(|s| {
                    s.session_token = None;
                    s.cache = None;
                });
                Ok(self.empty_result())
            }
            Fetched::Ok(mut result, renewed) => {
                let unavailable = result.unavailable.clone().unwrap_or_default();
                if !unavailable.is_empty() {
                    if let Some(c) = &cache {
                        let have: HashSet<&str> = result.contributions.iter().map(|c| c.id.as_str()).collect();
                        let merged: Vec<_> = c
                            .result
                            .contributions
                            .iter()
                            .filter(|x| unavailable.contains(&x.provider) && !have.contains(x.id.as_str()))
                            .cloned()
                            .collect();
                        result.contributions.extend(merged);
                    }
                    result.stale = true;
                }
                result.from_cache = false;
                let stored_result = result.clone();
                // Never fail a read because the cache cannot be written.
                let _ = self.storage().update(move |s| {
                    if let Some(t) = renewed {
                        s.session_token = Some(t);
                    }
                    s.cache = Some(Cache { result: stored_result, stored_at: now_iso() });
                });
                Ok(result)
            }
        }
    }

    async fn fetch_contributions(&self, token: &str) -> Fetched {
        let url = format!("{}/api/v1/contributions", self.inner.api_base_url);
        let res = match self
            .inner
            .http
            .get(url)
            .bearer_auth(token)
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => return Fetched::Failed,
        };
        let status = res.status().as_u16();
        if status == 401 {
            return Fetched::SessionInvalid;
        }
        if status == 429 {
            let secs = res
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.trim().parse::<u64>().ok())
                .unwrap_or(60);
            return Fetched::RateLimited(secs);
        }
        if !res.status().is_success() {
            return Fetched::Failed;
        }
        let renewed = res
            .headers()
            .get("sponsorkit-session")
            .and_then(|v| v.to_str().ok())
            .filter(|v| v.starts_with("sks_"))
            .map(str::to_owned);
        match res.json::<ContributionResult>().await {
            Ok(r) => Fetched::Ok(r, renewed),
            Err(_) => Fetched::Failed,
        }
    }

    /// Signs out locally: deletes the session token and the cache, keeps nag
    /// state. A no-op when disabled.
    pub async fn sign_out(&self) -> Result<()> {
        if self.inner.disabled {
            return Ok(());
        }
        if let Some(mut m) = self.mock_state() {
            m.signed_in = false;
            m.contributions.clear();
            return Ok(());
        }
        if !self.storage().exists() {
            return Ok(());
        }
        self.storage().update(|s| {
            s.session_token = None;
            s.cache = None;
        })
    }

    /// Ensures the instance is usable for an interactive operation.
    pub(crate) fn ensure_enabled(&self) -> Result<()> {
        if self.inner.disabled { Err(Error::disabled()) } else { Ok(()) }
    }

    /// Whether the given provider is configured.
    pub(crate) fn has_provider(&self, p: Provider) -> bool {
        self.inner.targets.get(p).is_some()
    }
}

impl From<reqwest::Error> for Error {
    fn from(e: reqwest::Error) -> Self {
        Error::network(format!("HTTP error: {e}"), None)
    }
}

/// The epoch-ms deadline for a `Retry-After` of `secs` seconds from `now`.
///
/// Saturates instead of overflowing, so an absurd header value can neither
/// panic nor wrap into a deadline in the past.
fn retry_deadline(now: i64, secs: u64) -> i64 {
    now.saturating_add(i64::try_from(secs).unwrap_or(i64::MAX).saturating_mul(1000))
}

#[cfg(test)]
mod tests {
    use super::retry_deadline;

    #[test]
    fn retry_deadline_saturates() {
        assert_eq!(retry_deadline(1_000, 60), 61_000);
        assert_eq!(retry_deadline(1_000, 0), 1_000);
        let now = 1_763_316_000_000;
        assert_eq!(retry_deadline(now, 9_223_372_036_854_775_807), i64::MAX);
        assert_eq!(retry_deadline(now, u64::MAX), i64::MAX);
        assert_eq!(retry_deadline(now, 9_300_000_000_000_000), i64::MAX);
        assert!(retry_deadline(now, 1 << 63) > now);
    }
}
