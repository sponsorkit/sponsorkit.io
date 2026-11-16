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

/// How long loopback sign-in waits for the browser (PROTOCOL §7).
pub const LOOPBACK_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Options for [`Sponsorkit::sign_in`].
#[derive(Debug, Clone, Default)]
pub struct SignInOptions {
    /// Skips the provider picker. Signing in with a second provider while
    /// signed in adds that identity to the session.
    pub provider: Option<Provider>,
    /// Overrides the instance's [`SignInMethod`] for this call.
    pub method: Option<SignInMethod>,
    /// Cancels a pending sign-in; it then fails with [`ErrorCode::Timeout`].
    pub cancel: Option<CancellationToken>,
}

/// Which page starts the flow.
pub(crate) enum StartPage {
    /// `/connect`.
    Connect,
    /// `/checkout` with these checkout params (sign in first, then continue).
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
            CodeError::OpenFailed(m) => Error::internal(format!("Cannot open the browser: {m}")),
            CodeError::Cancelled => Error::new(ErrorCode::Timeout, "Sign-in was cancelled"),
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
    /// loopback port (5-minute timeout), or prints a URL to stderr and reads
    /// the code the page shows (paste-back). While already signed in, this
    /// adds an identity (pass `provider` to pick it).
    ///
    /// Errors: `disabled`, `access_denied` / `invalid_state` /
    /// `provider_error` (delivered by the sign-in page), `invalid_code`,
    /// `timeout`, `internal` (network or storage failure), `invalid_config`
    /// (dev-time target check).
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
            StartPage::Connect => "/connect",
            StartPage::Checkout(_) => "/checkout",
        };
        let mut url = reqwest::Url::parse(&format!("{}{}", self.inner.api_base_url, path)).expect("validated base URL");
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
        let code = match method {
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
        };
        Ok((code, verifier))
    }

    pub(crate) async fn open_url(&self, url: String) -> std::io::Result<()> {
        match &self.inner.open_browser {
            Some(hook) => hook(url).await,
            None => tokio::task::spawn_blocking(move || open_system_browser(&url))
                .await
                .unwrap_or_else(|e| Err(std::io::Error::other(e.to_string()))),
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
                let mut u =
                    reqwest::Url::parse(&format!("{}/checkout", self.inner.api_base_url)).expect("validated base URL");
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
        tokio::select! {
            opened = self.open_url(url.clone()) => {
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
        tokio::select! {
            got = rx => match got {
                Ok(Callback::Code(code)) => Ok(code),
                Ok(Callback::Error(e)) => Err(CodeError::Other(Error::new(
                    ErrorCode::from_callback(&e),
                    format!("Sign-in failed: {e}"),
                ))),
                Err(_) => Err(CodeError::Other(Error::internal("The loopback server stopped"))),
            },
            _ = tokio::time::sleep(LOOPBACK_TIMEOUT) => Err(CodeError::Other(Error::new(
                ErrorCode::Timeout,
                "Sign-in was not completed within 5 minutes",
            ))),
            _ = cancel.cancelled() => Err(CodeError::Cancelled),
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
                    tokio::task::spawn_blocking(|| {
                        let mut line = String::new();
                        std::io::stdin().read_line(&mut line).map(|_| line)
                    })
                    .await
                    .unwrap_or_else(|e| Err(std::io::Error::other(e.to_string())))
                }
            }
        };
        let never = CancellationToken::new();
        let cancel = cancel.unwrap_or(&never);
        let code = tokio::select! {
            c = prompt => c.map_err(|e| CodeError::Other(Error::internal(format!("Cannot read the sign-in code: {e}"))))?,
            _ = cancel.cancelled() => return Err(CodeError::Cancelled),
        };
        let code = code.trim().to_string();
        if code.is_empty() {
            return Err(CodeError::Other(Error::new(ErrorCode::InvalidCode, "No sign-in code was entered")));
        }
        Ok(code)
    }

    /// Exchanges a sign-in code at `/auth/token`, stores the session and caches the result.
    pub(crate) async fn exchange(&self, code: &str, verifier: &str) -> Result<ContributionResult> {
        let existing = self.storage().read().session_token;
        let res = match self.post_token(code, verifier, existing.as_deref()).await? {
            // The stored session is no longer valid: start a fresh session instead of adding to it.
            TokenOutcome::SessionInvalid if existing.is_some() => self.post_token(code, verifier, None).await?,
            other => other,
        };
        let token = match res {
            TokenOutcome::Ok(t) => t,
            TokenOutcome::SessionInvalid => {
                return Err(Error::new(ErrorCode::InvalidCode, "The server rejected the session"));
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
        let res = self
            .inner
            .http
            .post(url)
            .json(&body)
            .send()
            .await
            .map_err(|e| Error::internal(format!("Cannot reach Sponsorkit to finish sign-in: {e}")))?;
        let status = res.status();
        if status.is_success() {
            let t = res
                .json::<TokenResponse>()
                .await
                .map_err(|e| Error::internal(format!("Unexpected sign-in response: {e}")))?;
            return Ok(TokenOutcome::Ok(Box::new(t)));
        }
        let problem = res.json::<Problem>().await.ok();
        let wire = problem.as_ref().and_then(|p| p.code.clone()).unwrap_or_default();
        let detail = problem
            .as_ref()
            .and_then(|p| p.detail.clone().or_else(|| p.title.clone()))
            .unwrap_or_else(|| format!("HTTP {status}"));
        Ok(match (status.as_u16(), wire.as_str()) {
            (401, _) | (_, "session_invalid") => TokenOutcome::SessionInvalid,
            (_, "invalid_code") => TokenOutcome::Failed(Error::new(ErrorCode::InvalidCode, detail)),
            (400, "invalid_request") => TokenOutcome::Failed(Error::new(ErrorCode::InvalidCode, detail)),
            _ => TokenOutcome::Failed(Error::internal(format!("Sign-in failed: {detail}"))),
        })
    }
}

enum TokenOutcome {
    Ok(Box<TokenResponse>),
    SessionInvalid,
    Failed(Error),
}
