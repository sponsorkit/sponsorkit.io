//! Native sign-in: loopback and paste-back (PROTOCOL §7).

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::json;
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

use crate::client::{SignInMethod, Sponsorkit};
use crate::error::{Error, ErrorCode, Result};
use crate::pkce::{code_challenge, generate_verifier};
use crate::platform::{has_display, open_system_browser};
use crate::storage::Cache;
use crate::targets::Provider;
use crate::time::now_iso;
use crate::types::{ContributionResult, Problem, TokenResponse};

/// Options for [`Sponsorkit::sign_in`].
#[derive(Debug, Clone, Default)]
pub struct SignInOptions {
    /// Skips the provider picker. Signing in with a second provider while
    /// signed in adds that identity to the session.
    pub provider: Option<Provider>,
    /// Overrides the instance's [`SignInMethod`] for this call.
    pub method: Option<SignInMethod>,
    /// Cancels a pending sign-in; it then fails with [`ErrorCode::Cancelled`].
    /// Dropping the `sign_in` future also stops it (without a result).
    pub cancel: Option<CancellationToken>,
}

/// Which page starts the flow.
pub(crate) enum StartPage {
    /// `<site_base_url>/connect/`.
    Connect,
    /// `<site_base_url>/checkout/` with these checkout params (sign in first, then continue).
    Checkout(Vec<(String, String)>),
}

/// Why getting a code failed.
pub(crate) enum CodeError {
    /// The browser could not be opened (auto mode falls back to paste-back).
    OpenFailed(String),
    /// Cancelled through the cancellation token.
    Cancelled,
    /// Any other error.
    Other(Error),
}

impl From<Error> for CodeError {
    fn from(e: Error) -> Self {
        CodeError::Other(e)
    }
}

impl From<CodeError> for Error {
    fn from(e: CodeError) -> Self {
        match e {
            CodeError::OpenFailed(m) => Error::environment(format!("Cannot start loopback sign-in: {m}")),
            CodeError::Cancelled => Error::new(ErrorCode::Cancelled, "Sign-in was cancelled"),
            CodeError::Other(e) => e,
        }
    }
}

const DONE_HTML: &str = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Sponsorkit</title></head>\
<body style=\"font-family:system-ui,sans-serif;text-align:center;padding:3em\"><h1>Signed in</h1>\
<p>You can close this window and return to the app.</p></body></html>";

fn error_html(code: &str) -> String {
    let safe: String = code.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').collect();
    format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Sponsorkit</title></head>\
<body style=\"font-family:system-ui,sans-serif;text-align:center;padding:3em\"><h1>Sign-in failed</h1>\
<p>{safe}</p><p>You can close this window.</p></body></html>"
    )
}

/// What the loopback callback received.
enum Callback {
    Code(String),
    Error(String),
}

type CallbackSender = Arc<Mutex<Option<oneshot::Sender<Callback>>>>;

async fn read_request_target(stream: &mut TcpStream) -> Option<String> {
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    loop {
        let n = stream.read(&mut chunk).await.ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&chunk[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") || buf.windows(2).any(|w| w == b"\n\n") {
            break;
        }
        if buf.len() > 16 * 1024 {
            return None;
        }
    }
    let head = String::from_utf8_lossy(&buf);
    let line = head.lines().next()?;
    let mut parts = line.split_whitespace();
    let method = parts.next()?;
    let target = parts.next()?;
    (method == "GET").then(|| target.to_string())
}

async fn respond(stream: &mut TcpStream, status: &str, extra_headers: &str, body: &str) {
    let msg = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n{extra_headers}\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(msg.as_bytes()).await;
    let _ = stream.flush().await;
    let _ = stream.shutdown().await;
}

async fn handle_connection(mut stream: TcpStream, tx: CallbackSender, redirect_after: Option<Arc<str>>) {
    let Ok(Some(target)) = tokio::time::timeout(Duration::from_secs(30), read_request_target(&mut stream)).await else {
        return;
    };
    let Ok(url) = reqwest::Url::parse(&format!("http://127.0.0.1{target}")) else {
        respond(&mut stream, "400 Bad Request", "", "Bad request").await;
        return;
    };
    if url.path() != "/callback" {
        respond(&mut stream, "404 Not Found", "", "Not found").await;
        return;
    }
    let get = |k: &str| url.query_pairs().find(|(n, _)| n == k).map(|(_, v)| v.into_owned()).filter(|v| !v.is_empty());
    let callback = match (get("code"), get("error")) {
        (_, Some(e)) => Callback::Error(e),
        (Some(c), None) => Callback::Code(c),
        (None, None) => {
            respond(&mut stream, "400 Bad Request", "", &error_html("missing_code")).await;
            return;
        }
    };
    let Some(sender) = tx.lock().unwrap_or_else(|e| e.into_inner()).take() else {
        respond(&mut stream, "200 OK", "", DONE_HTML).await;
        return;
    };
    match (&callback, redirect_after) {
        (Callback::Code(_), Some(location)) => {
            respond(&mut stream, "302 Found", &format!("Location: {location}\r\n"), "").await;
        }
        (Callback::Code(_), None) => respond(&mut stream, "200 OK", "", DONE_HTML).await,
        (Callback::Error(e), _) => respond(&mut stream, "200 OK", "", &error_html(e)).await,
    }
    let _ = sender.send(callback);
}

/// Reads lines from a blocking source on one long-lived thread.
///
/// A blocking read cannot be cancelled. Running it on `spawn_blocking` per
/// prompt would leave an orphaned reader after a timeout or cancel that keeps
/// the tokio runtime from shutting down and swallows the next line. Instead one
/// detached thread reads a line only when asked; a prompt that is abandoned
/// leaves its request pending, and the line it yields goes to the next prompt.
pub(crate) struct LineReader {
    state: tokio::sync::Mutex<LineReaderState>,
}

struct LineReaderState {
    requests: std::sync::mpsc::Sender<()>,
    lines: tokio::sync::mpsc::UnboundedReceiver<std::io::Result<String>>,
    /// A line has been requested and not yet received.
    pending: bool,
}

impl LineReader {
    pub(crate) fn spawn<F>(mut read_line: F) -> LineReader
    where
        F: FnMut(&mut String) -> std::io::Result<usize> + Send + 'static,
    {
        let (req_tx, req_rx) = std::sync::mpsc::channel::<()>();
        let (line_tx, line_rx) = tokio::sync::mpsc::unbounded_channel();
        std::thread::Builder::new()
            .name("sponsorkit-stdin".into())
            .spawn(move || {
                while req_rx.recv().is_ok() {
                    let mut line = String::new();
                    let got = read_line(&mut line).map(|_| line);
                    if line_tx.send(got).is_err() {
                        break;
                    }
                }
            })
            .map(|_| ())
            .unwrap_or_else(|e| eprintln!("sponsorkit: cannot start the stdin reader: {e}"));
        LineReader {
            state: tokio::sync::Mutex::new(LineReaderState { requests: req_tx, lines: line_rx, pending: false }),
        }
    }

    /// Reads one line (empty at end of input). Cancel-safe: dropping the
    /// future loses nothing.
    pub(crate) async fn read_line(&self) -> std::io::Result<String> {
        let mut st = self.state.lock().await;
        if !st.pending {
            st.requests.send(()).map_err(|_| std::io::Error::other("the stdin reader is not running"))?;
            st.pending = true;
        }
        let got = st.lines.recv().await;
        st.pending = false;
        got.unwrap_or_else(|| Err(std::io::Error::other("the stdin reader is not running")))
    }
}

/// The process-wide stdin reader used by the default paste-back prompt.
fn stdin_lines() -> &'static LineReader {
    static READER: std::sync::OnceLock<LineReader> = std::sync::OnceLock::new();
    // `Stdin::read_line` locks stdin only while reading and shares its buffer
    // with the rest of the process.
    READER.get_or_init(|| LineReader::spawn(|line| std::io::stdin().read_line(line)))
}

/// Aborts a spawned task when dropped.
struct AbortOnDrop(tokio::task::JoinHandle<()>);

impl Drop for AbortOnDrop {
    fn drop(&mut self) {
        self.0.abort();
    }
}

impl Sponsorkit {
    /// Signs the supporter in (SPEC §6.2) and returns the fresh result.
    ///
    /// Opens the browser on the consent page and waits for the code on a
    /// loopback port, or prints a URL to stderr and reads the code the page
    /// shows (paste-back). Waits at most [`crate::Options::sign_in_timeout`]
    /// (default 300 s). While already signed in, this adds an identity (pass
    /// `provider` to pick it); if the stored session turns out to be dead, it
    /// is cleared and a new session is started with the same code.
    ///
    /// Errors (PROTOCOL §7): `disabled`; `access_denied` / `invalid_state` /
    /// `provider_error` (delivered by the sign-in page); `invalid_code` (the
    /// API rejected the code); `cancelled` ([`SignInOptions::cancel`], or
    /// nothing entered at the paste-back prompt); `timeout`; `network_error`
    /// (the API could not be reached or answered 5xx/429/unexpectedly, with
    /// [`Error::retry_after`] when it sent `Retry-After`); `invalid_config`
    /// (unconfigured provider, dev-time target check, unwritable storage).
    pub async fn sign_in(&self, options: SignInOptions) -> Result<ContributionResult> {
        self.ensure_enabled()?;
        if let Some(mut m) = self.mock_state() {
            if !m.signed_in {
                m.signed_in = true;
                m.contributions.clear();
            }
            return Ok(m.result(&self.inner.targets));
        }
        self.dev_check().await?;
        let mut extra = Vec::new();
        if let Some(p) = options.provider {
            if !self.has_provider(p) {
                return Err(Error::invalid_config(format!("{p} is not one of the configured targets")));
            }
            extra.push(("provider".to_string(), p.as_str().to_string()));
        }
        if self.is_signed_in() {
            extra.push(("add".to_string(), "1".to_string()));
        }
        let method = options.method.unwrap_or(self.inner.sign_in_method);
        let (code, verifier) =
            self.obtain_code(StartPage::Connect, extra, method, options.cancel.as_ref()).await.map_err(Error::from)?;
        self.exchange(&code, &verifier).await
    }

    fn page_url(
        &self,
        page: &StartPage,
        challenge: &str,
        delivery: &str,
        redirect_uri: Option<&str>,
        extra: &[(String, String)],
    ) -> String {
        let path = match page {
            StartPage::Connect => "/connect/",
            StartPage::Checkout(_) => "/checkout/",
        };
        let mut url =
            reqwest::Url::parse(&format!("{}{}", self.inner.site_base_url, path)).expect("validated base URL");
        {
            let mut q = url.query_pairs_mut();
            match page {
                StartPage::Connect => {
                    q.append_pair("targets", &self.inner.targets.param());
                }
                StartPage::Checkout(params) => {
                    for (k, v) in params {
                        q.append_pair(k, v);
                    }
                }
            }
            q.append_pair("challenge", challenge);
            q.append_pair("delivery", delivery);
            if let Some(r) = redirect_uri {
                q.append_pair("redirect_uri", r);
            }
            if let Some(app) = &self.inner.app_name {
                q.append_pair("app_name", app);
            }
            for (k, v) in extra {
                q.append_pair(k, v);
            }
        }
        url.to_string()
    }

    /// Runs the browser part of sign-in and returns `(code, verifier)`.
    pub(crate) async fn obtain_code(
        &self,
        page: StartPage,
        extra: Vec<(String, String)>,
        method: SignInMethod,
        cancel: Option<&CancellationToken>,
    ) -> std::result::Result<(String, String), CodeError> {
        let verifier = generate_verifier()?;
        let challenge = code_challenge(&verifier);
        let limit = self.inner.sign_in_timeout;
        let wait = async {
            Ok::<String, CodeError>(match method {
                SignInMethod::Loopback => self.loopback(&page, &challenge, &extra, cancel, false).await?,
                SignInMethod::Paste => self.paste(&page, &challenge, &extra, cancel).await?,
                SignInMethod::Auto => {
                    if self.inner.open_browser.is_none() && !has_display() {
                        self.paste(&page, &challenge, &extra, cancel).await?
                    } else {
                        match self.loopback(&page, &challenge, &extra, cancel, true).await {
                            Err(CodeError::OpenFailed(_)) => self.paste(&page, &challenge, &extra, cancel).await?,
                            other => other?,
                        }
                    }
                }
            })
        };
        let code = match tokio::time::timeout(limit, wait).await {
            Ok(code) => code?,
            Err(_) => {
                return Err(CodeError::Other(Error::new(
                    ErrorCode::Timeout,
                    format!("Sign-in was not completed within {} s", limit.as_secs_f64()),
                )));
            }
        };
        Ok((code, verifier))
    }

    pub(crate) async fn open_url(&self, url: String) -> std::io::Result<()> {
        self.open_url_future(url).await
    }

    /// The future that opens `url`; `'static` so it can outlive the caller.
    fn open_url_future(&self, url: String) -> crate::client::BoxFuture<std::io::Result<()>> {
        match &self.inner.open_browser {
            Some(hook) => hook(url),
            None => Box::pin(async move {
                tokio::task::spawn_blocking(move || open_system_browser(&url))
                    .await
                    .unwrap_or_else(|e| Err(std::io::Error::other(e.to_string())))
            }),
        }
    }

    async fn loopback(
        &self,
        page: &StartPage,
        challenge: &str,
        extra: &[(String, String)],
        cancel: Option<&CancellationToken>,
        fail_if_unopened: bool,
    ) -> std::result::Result<String, CodeError> {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .map_err(|e| CodeError::OpenFailed(format!("cannot listen on 127.0.0.1: {e}")))?;
        let port = listener.local_addr().map_err(|e| CodeError::OpenFailed(e.to_string()))?.port();
        let redirect_uri = format!("http://127.0.0.1:{port}/callback");
        let url = self.page_url(page, challenge, "loopback", Some(&redirect_uri), extra);
        // During checkout the callback sends the browser on to the provider chooser.
        let redirect_after: Option<Arc<str>> = match page {
            StartPage::Connect => None,
            StartPage::Checkout(params) => {
                let mut u = reqwest::Url::parse(&format!("{}/checkout/", self.inner.site_base_url))
                    .expect("validated base URL");
                {
                    let mut q = u.query_pairs_mut();
                    for (k, v) in params {
                        q.append_pair(k, v);
                    }
                    q.append_pair("step", "choose");
                }
                Some(Arc::from(u.to_string()))
            }
        };
        let (tx, rx) = oneshot::channel();
        let tx: CallbackSender = Arc::new(Mutex::new(Some(tx)));
        let server = tokio::spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else {
                    // E.g. out of file descriptors: back off instead of spinning.
                    tokio::time::sleep(Duration::from_millis(50)).await;
                    continue;
                };
                tokio::spawn(handle_connection(stream, tx.clone(), redirect_after.clone()));
            }
        });
        let _server = AbortOnDrop(server);

        let never = CancellationToken::new();
        let cancel = cancel.unwrap_or(&never);
        // Wait for the callback while the browser is being opened: a launcher
        // (or hook) that is slow to return must not hold up a sign-in that has
        // already completed.
        let mut open = Some(self.open_url_future(url.clone()));
        let mut rx = rx;
        loop {
            tokio::select! {
                got = &mut rx => {
                    // Like a real browser, the opener carries on by itself (e.g. it
                    // follows the callback's redirect to the provider chooser).
                    if let Some(open) = open.take() {
                        tokio::spawn(async move {
                            let _ = open.await;
                        });
                    }
                    return match got {
                        Ok(Callback::Code(code)) => Ok(code),
                        Ok(Callback::Error(e)) => Err(CodeError::Other(Error::new(
                            ErrorCode::from_callback(&e),
                            format!("Sign-in failed: {e}"),
                        ))),
                        Err(_) => Err(CodeError::Cancelled),
                    };
                }
                opened = async { open.as_mut().expect("guarded").await }, if open.is_some() => {
                    open = None;
                    if let Err(e) = opened {
                        if fail_if_unopened {
                            return Err(CodeError::OpenFailed(e.to_string()));
                        }
                        // Loopback was requested explicitly: let the user open the page themselves.
                        eprintln!("\nCould not open a browser ({e}). Open this URL on this machine to sign in:\n\n  {url}\n");
                    }
                }
                _ = cancel.cancelled() => return Err(CodeError::Cancelled),
            }
        }
    }

    async fn paste(
        &self,
        page: &StartPage,
        challenge: &str,
        extra: &[(String, String)],
        cancel: Option<&CancellationToken>,
    ) -> std::result::Result<String, CodeError> {
        let url = self.page_url(page, challenge, "paste", None, extra);
        eprintln!("\nTo sign in with Sponsorkit, open this URL in a browser on any device:\n\n  {url}\n");
        let prompt = async {
            match &self.inner.prompt_for_code {
                Some(hook) => hook(url.clone()).await,
                None => {
                    eprint!("Then paste the code shown on the page here: ");
                    stdin_lines().read_line().await
                }
            }
        };
        let never = CancellationToken::new();
        let cancel = cancel.unwrap_or(&never);
        let code = tokio::select! {
            c = prompt => c.map_err(|e| CodeError::Other(Error::new(
                ErrorCode::Cancelled,
                format!("Cannot read the sign-in code: {e}"),
            )))?,
            _ = cancel.cancelled() => return Err(CodeError::Cancelled),
        };
        let code = code.trim().to_string();
        if code.is_empty() {
            return Err(CodeError::Other(Error::new(ErrorCode::Cancelled, "No sign-in code was entered")));
        }
        Ok(code)
    }

    /// Exchanges a sign-in code at `/auth/token`, stores the session and caches the result.
    pub(crate) async fn exchange(&self, code: &str, verifier: &str) -> Result<ContributionResult> {
        let existing = self.storage().read().session_token;
        let res = match self.post_token(code, verifier, existing.as_deref()).await? {
            // Adding an identity to a dead session (PROTOCOL §7): clear the
            // stored session and retry the same code once without it.
            TokenOutcome::SessionInvalid if existing.is_some() => {
                self.storage().update(|s| {
                    s.session_token = None;
                    s.cache = None;
                })?;
                self.post_token(code, verifier, None).await?
            }
            other => other,
        };
        let token = match res {
            TokenOutcome::Ok(t) => t,
            TokenOutcome::SessionInvalid => {
                return Err(Error::network("Unexpected 401 session_invalid from /auth/token", None));
            }
            TokenOutcome::Failed(e) => return Err(e),
        };
        let result = token.result.clone();
        self.storage().update(move |s| {
            s.session_token = Some(token.session_token);
            s.cache = Some(Cache { result: token.result, stored_at: now_iso() });
        })?;
        Ok(result)
    }

    async fn post_token(&self, code: &str, verifier: &str, session: Option<&str>) -> Result<TokenOutcome> {
        let mut body = json!({ "code": code, "codeVerifier": verifier });
        if let Some(s) = session {
            body["sessionToken"] = json!(s);
        }
        let url = format!("{}/api/v1/auth/token", self.inner.api_base_url);
        let res = crate::client::with_timeout(self.inner.http.post(url).json(&body), self.inner.request_timeout)
            .send()
            .await
            .map_err(|e| Error::network(format!("Cannot reach Sponsorkit to finish sign-in: {e}"), None))?;
        let status = res.status();
        if status.is_success() {
            let t = res
                .json::<TokenResponse>()
                .await
                .map_err(|e| Error::network(format!("Unexpected sign-in response: {e}"), None))?;
            return Ok(TokenOutcome::Ok(Box::new(t)));
        }
        let retry_after = retry_after_secs(res.headers());
        let problem = res.json::<Problem>().await.ok();
        let wire = problem.as_ref().and_then(|p| p.code.clone()).unwrap_or_default();
        let detail = problem
            .as_ref()
            .and_then(|p| p.detail.clone().or_else(|| p.title.clone()))
            .unwrap_or_else(|| format!("HTTP {status}"));
        Ok(match (status.as_u16(), wire.as_str()) {
            (401, _) => TokenOutcome::SessionInvalid,
            (400, "invalid_code") => TokenOutcome::Failed(Error::new(ErrorCode::InvalidCode, detail)),
            // 5xx, 429 and anything unexpected (PROTOCOL §7).
            _ => TokenOutcome::Failed(Error::network(format!("Sign-in failed: HTTP {status}: {detail}"), retry_after)),
        })
    }
}

enum TokenOutcome {
    Ok(Box<TokenResponse>),
    SessionInvalid,
    Failed(Error),
}

/// The `Retry-After` header as whole seconds (delta-seconds form), clamped
/// to [`crate::MAX_RETRY_AFTER`]. Anything that is not a non-negative integer
/// (`inf`, `NaN`, `1e9`, `-5`, a date…) is ignored (PROTOCOL §7.0); an integer
/// too large for `u64` is clamped like any other large value.
pub(crate) fn retry_after_secs(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    parse_retry_after(headers.get(reqwest::header::RETRY_AFTER)?.to_str().ok()?)
}

pub(crate) fn parse_retry_after(value: &str) -> Option<u64> {
    let v = value.trim();
    if v.is_empty() || !v.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let max = crate::MAX_RETRY_AFTER.as_secs();
    Some(v.parse::<u64>().map_or(max, |n| n.min(max)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::{OpenBrowserHook, Options};

    /// A line source fed from a channel, standing in for a terminal.
    fn fake_stdin() -> (std::sync::mpsc::Sender<String>, LineReader) {
        let (tx, rx) = std::sync::mpsc::channel::<String>();
        let reader = LineReader::spawn(move |line| match rx.recv() {
            Ok(l) => {
                line.push_str(&l);
                Ok(l.len())
            }
            Err(_) => Ok(0),
        });
        (tx, reader)
    }

    #[test]
    fn retry_after_is_clamped_and_non_finite_values_are_ignored() {
        assert_eq!(parse_retry_after("120"), Some(120));
        assert_eq!(parse_retry_after(" 0 "), Some(0));
        assert_eq!(parse_retry_after("86400"), Some(86_400));
        assert_eq!(parse_retry_after("86401"), Some(86_400));
        assert_eq!(parse_retry_after("18446744073709551615"), Some(86_400));
        assert_eq!(parse_retry_after("99999999999999999999999999999999"), Some(86_400));
        for bad in ["", "inf", "Infinity", "NaN", "-5", "1.5", "1e9", "Wed, 21 Oct 2015 07:28:00 GMT"] {
            assert_eq!(parse_retry_after(bad), None, "{bad}");
        }
    }

    /// A raw HTTP server that answers every request with `response`.
    async fn one_shot_server(status: &'static str, body: &'static str) -> String {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            while let Ok((mut s, _)) = listener.accept().await {
                tokio::spawn(async move {
                    let mut buf = vec![0u8; 8192];
                    let _ = s.read(&mut buf).await;
                    if !status.is_empty() {
                        let response = format!(
                            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                            body.len()
                        );
                        let _ = s.write_all(response.as_bytes()).await;
                        let _ = s.shutdown().await;
                    } else {
                        // Never answer.
                        tokio::time::sleep(Duration::from_secs(60)).await;
                    }
                });
            }
        });
        format!("http://127.0.0.1:{port}")
    }

    fn client_for(base: String, dir: &std::path::Path, request_timeout: Option<Duration>) -> Sponsorkit {
        Sponsorkit::new(Options {
            github: Some("octocat".into()),
            storage_dir: Some(dir.to_path_buf()),
            api_base_url: Some(base),
            request_timeout,
            env: Some(Default::default()),
            ..Default::default()
        })
        .unwrap()
    }

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("sponsorkit-signin-{tag}-{}", std::process::id()))
    }

    #[tokio::test]
    async fn unexpected_400_from_auth_token_is_a_network_error() {
        let base = one_shot_server("400 Bad Request", r#"{"code":"invalid_request","detail":"nope"}"#).await;
        let dir = temp_dir("400");
        let sk = client_for(base, &dir, None);
        let err = sk.exchange("c", "v").await.unwrap_err();
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(err.code(), ErrorCode::NetworkError, "{err}");
    }

    #[tokio::test]
    async fn auth_token_request_times_out_as_network_error() {
        let base = one_shot_server("", "").await;
        let dir = temp_dir("timeout");
        let sk = client_for(base, &dir, Some(Duration::from_millis(300)));
        let started = std::time::Instant::now();
        let err = sk.exchange("c", "v").await.unwrap_err();
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(err.code(), ErrorCode::NetworkError, "{err}");
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[tokio::test]
    async fn sign_in_storage_write_failure_is_invalid_config() {
        let base = one_shot_server(
            "200 OK",
            r#"{"sessionToken":"sks_new","expiresAt":"2026-12-16T00:00:00Z","result":{"signedIn":true,"supporter":null,"targets":["github:octocat"],"contributions":[],"fetchedAt":null,"stale":false,"fromCache":false,"disabled":false,"mock":false}}"#,
        )
        .await;
        // The storage "directory" is a regular file, so nothing can be written.
        let file = temp_dir("blocked");
        std::fs::write(&file, b"x").unwrap();
        let sk = client_for(base, &file, None);
        let err = sk.exchange("c", "v").await.unwrap_err();
        let _ = std::fs::remove_file(&file);
        assert_eq!(err.code(), ErrorCode::InvalidConfig, "{err}");
    }

    #[tokio::test]
    async fn loopback_ignores_malformed_callbacks_and_keeps_waiting() {
        let dir = temp_dir("bare");
        let statuses = Arc::new(Mutex::new(Vec::<String>::new()));
        let seen = statuses.clone();
        let hook: OpenBrowserHook = Arc::new(move |url: String| {
            let seen = seen.clone();
            Box::pin(async move {
                let u = reqwest::Url::parse(&url).unwrap();
                let redirect = u.query_pairs().find(|(k, _)| k == "redirect_uri").unwrap().1.into_owned();
                for path in ["/callback", "/callback?code=", "/callback?error=&code=", "/callback?code=good"] {
                    let r = reqwest::get(format!("{redirect}{}", path.trim_start_matches("/callback"))).await.unwrap();
                    seen.lock().unwrap().push(format!("{path} {}", r.status().as_u16()));
                }
                Ok(())
            })
        });
        let sk = Sponsorkit::new(Options {
            github: Some("octocat".into()),
            storage_dir: Some(dir.clone()),
            sign_in_timeout: Some(Duration::from_secs(5)),
            open_browser: Some(hook),
            ..Default::default()
        })
        .unwrap();
        let got = sk.obtain_code(StartPage::Connect, Vec::new(), SignInMethod::Loopback, None).await;
        let _ = std::fs::remove_dir_all(&dir);
        match got {
            Ok((code, _)) => assert_eq!(code, "good"),
            Err(_) => panic!("loopback sign-in did not complete"),
        }
        // Give the hook a moment to record the last status.
        tokio::time::sleep(Duration::from_millis(100)).await;
        let s = statuses.lock().unwrap().clone();
        assert_eq!(&s[..3], ["/callback 400", "/callback?code= 400", "/callback?error=&code= 400"]);
    }

    #[tokio::test]
    async fn auto_falls_back_to_paste_when_the_opener_fails() {
        let dir = temp_dir("fallback");
        let hook: OpenBrowserHook =
            Arc::new(|_url: String| Box::pin(async { Err(std::io::Error::other("launcher exited with 1")) }));
        let prompt: crate::client::PromptForCodeHook = Arc::new(|url: String| {
            Box::pin(async move {
                assert!(url.contains("delivery=paste"));
                Ok("pasted".to_string())
            })
        });
        let sk = Sponsorkit::new(Options {
            github: Some("octocat".into()),
            storage_dir: Some(dir.clone()),
            sign_in_timeout: Some(Duration::from_secs(5)),
            open_browser: Some(hook),
            prompt_for_code: Some(prompt),
            ..Default::default()
        })
        .unwrap();
        let got = sk.obtain_code(StartPage::Connect, Vec::new(), SignInMethod::Auto, None).await;
        let _ = std::fs::remove_dir_all(&dir);
        match got {
            Ok((code, _)) => assert_eq!(code, "pasted"),
            Err(_) => panic!("auto sign-in did not fall back to paste-back"),
        }
    }

    #[tokio::test]
    async fn abandoned_prompt_leaves_the_line_for_the_next_one() {
        let (tx, reader) = fake_stdin();
        // The first prompt times out without input.
        assert!(tokio::time::timeout(Duration::from_millis(100), reader.read_line()).await.is_err());
        // The line typed afterwards is not swallowed by the abandoned prompt.
        tx.send("code-1\n".into()).unwrap();
        assert_eq!(reader.read_line().await.unwrap(), "code-1\n");
        // Reads are on demand: nothing is consumed until the next prompt asks.
        tx.send("code-2\n".into()).unwrap();
        assert_eq!(reader.read_line().await.unwrap(), "code-2\n");
        drop(tx);
        assert_eq!(reader.read_line().await.unwrap(), "");
    }

    #[test]
    fn abandoned_prompt_does_not_block_runtime_shutdown() {
        let (_tx, reader) = fake_stdin();
        let started = std::time::Instant::now();
        let rt = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        rt.block_on(async {
            assert!(tokio::time::timeout(Duration::from_millis(50), reader.read_line()).await.is_err());
        });
        drop(rt);
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[tokio::test]
    async fn loopback_does_not_wait_for_the_launcher_to_return() {
        let dir = std::env::temp_dir().join(format!("sponsorkit-test-{}", std::process::id()));
        // A launcher that delivers the callback and then stays in the foreground.
        let hook: OpenBrowserHook = Arc::new(|url: String| {
            Box::pin(async move {
                let u = reqwest::Url::parse(&url).unwrap();
                let redirect = u.query_pairs().find(|(k, _)| k == "redirect_uri").unwrap().1.into_owned();
                let r = reqwest::Url::parse(&redirect).unwrap();
                let mut s = TcpStream::connect((r.host_str().unwrap(), r.port().unwrap())).await.unwrap();
                s.write_all(b"GET /callback?code=abc HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").await.unwrap();
                let mut buf = [0u8; 64];
                let _ = s.read(&mut buf).await;
                std::future::pending::<std::io::Result<()>>().await
            })
        });
        let sk = Sponsorkit::new(Options {
            github: Some("octocat".into()),
            storage_dir: Some(dir.clone()),
            sign_in_timeout: Some(Duration::from_secs(5)),
            open_browser: Some(hook),
            ..Default::default()
        })
        .unwrap();
        let started = std::time::Instant::now();
        let got = sk.obtain_code(StartPage::Connect, Vec::new(), SignInMethod::Loopback, None).await;
        let _ = std::fs::remove_dir_all(&dir);
        match got {
            Ok((code, _)) => assert_eq!(code, "abc"),
            Err(_) => panic!("loopback sign-in did not complete"),
        }
        assert!(started.elapsed() < Duration::from_secs(4));
    }
}
