---
title: Backend verification in Rust
description: Verify a supporter's session token on your server with sponsorkit::server::verify_session, for example in an axum handler.
sidebar_label: Backend verification
order: 70
---

Anything your app decides on the user's machine can be patched out. When a contribution must unlock something on
*your* server (a download, an API quota, a hosted feature), the app sends its session token to your backend, and
the backend asks Sponsorkit about it. No API key is involved: the token is sealed by Sponsorkit and can't be
forged or edited. The full picture is in [verify supporters on your backend](../../guides/backend-verification.md).

## `server::verify_session`

```rust
pub async fn verify_session(token: &str, targets: &Targets) -> Result<ContributionResult>
pub async fn verify_session_with(token: &str, targets: &Targets, options: VerifyOptions) -> Result<ContributionResult>
```

It calls Sponsorkit live (`GET /api/v1/contributions`, with no cache and no local storage), checks that the session
was issued for **exactly** your `targets`, and returns the same [`ContributionResult`](contributions.md) the
client gets. `supporter.id` is stable for a person and your target set, so you can key your own user records on
it.

`Targets` names the accounts, like the `github` and `opencollective` fields of `Options`:

```rust
use sponsorkit::Targets;

fn my_targets() -> Targets {
    Targets::github("octocat").with_opencollective("my-collective")
}
```

You don't need a `Sponsorkit` client on the server, and `verify_session` doesn't need a storage directory or a
terminal.

```rust title="src/main.rs"
use sponsorkit::server::verify_session;
use sponsorkit::{ErrorCode, Targets};

/// Returns an HTTP status and body for a download request carrying a session token.
async fn handle_download(token: &str) -> (u16, String) {
    let targets = Targets::github("octocat").with_opencollective("my-collective");
    match verify_session(token, &targets).await {
        Ok(fc) if fc.active().iter().any(|c| c.amount.currency == "USD" && c.amount.value >= 500) => {
            let id = fc.supporter.map(|s| s.id).unwrap_or_default();
            (200, format!("Here's your download, {id}"))
        }
        Ok(_) => (403, "This download is for supporters".into()),
        Err(e) if matches!(e.code(), ErrorCode::SessionInvalid | ErrorCode::TargetsMismatch) => {
            (401, "Please sign in again".into())
        }
        Err(e) => {
            let retry = e.retry_after().map_or(60, |d| d.as_secs());
            (503, format!("Try again in {retry} seconds"))
        }
    }
}

#[tokio::main]
async fn main() {
    let token = std::env::args().nth(1).unwrap_or_default();
    let (status, body) = handle_download(&token).await;
    println!("{status} {body}");
}
```

## Errors

| Code | Meaning | Suggested response |
|---|---|---|
| `session_invalid` | The token is empty, malformed, expired, tampered with or sealed with a retired key (the API answered `401`). | `401`: ask the user to sign in again. |
| `targets_mismatch` | The token is genuine but was issued for a different set of targets. | `401` or `403`. |
| `network_error` | Sponsorkit couldn't be reached, didn't answer within the request timeout, or answered 5xx, 429 or something unexpected. `e.retry_after()` has the API's `Retry-After` when it sent one. | `503`, and retry later. |
| `invalid_config` | Your `targets` or `api_base_url` are missing or malformed. | Fix your code. |

Unlike `get_financial_contribution`, `verify_session` **does** fail on network problems. On a client, a stale
answer is better than an error; on a server deciding access, "I don't know" must be visible so you can choose
whether to fail open or closed.

## Options

`verify_session_with` takes a `VerifyOptions`:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `api_base_url` | `Option<String>` | `https://api.sponsorkit.io` | For [self-hosting](../../reference-http/self-hosting.md) and tests. |
| `http_client` | `Option<reqwest::Client>` | a new client per call | Pass a shared client so connections are pooled across requests. |
| `request_timeout` | `Option<Duration>` | 30 seconds | Bounds the request, including reading the body. `Some(Duration::ZERO)` disables it. Exceeding it fails with `network_error`. |

`reqwest::Client` is the `reqwest` 0.12 client type; add `reqwest` to your own dependencies to create one.

## In an axum handler

This example uses [axum](https://crates.io/crates/axum) 0.8 and `reqwest` 0.12 next to `sponsorkit` and `tokio`.
The client sends its token in an `X-Sponsorkit-Session` header (any header name works, as long as both sides
agree):

```rust title="src/main.rs"
use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::get;
use axum::Router;
use sponsorkit::server::{VerifyOptions, verify_session_with};
use sponsorkit::{ErrorCode, Targets};

struct AppState {
    targets: Targets,
    http: reqwest::Client, // shared, so connections are pooled
}

async fn download(State(state): State<Arc<AppState>>, headers: HeaderMap) -> (StatusCode, String) {
    let token = headers.get("x-sponsorkit-session").and_then(|v| v.to_str().ok()).unwrap_or_default();
    let options = VerifyOptions {
        http_client: Some(state.http.clone()),
        request_timeout: Some(Duration::from_secs(10)),
        ..Default::default()
    };
    match verify_session_with(token, &state.targets, options).await {
        Ok(fc) if !fc.active().is_empty() => (StatusCode::OK, "Thanks for supporting us!".into()),
        Ok(_) => (StatusCode::FORBIDDEN, "This download is for supporters".into()),
        Err(e) => match e.code() {
            ErrorCode::SessionInvalid | ErrorCode::TargetsMismatch => {
                (StatusCode::UNAUTHORIZED, "Please sign in again".into())
            }
            _ => (StatusCode::SERVICE_UNAVAILABLE, "Can't check your contribution right now".into()),
        },
    }
}

#[tokio::main]
async fn main() {
    let state = Arc::new(AppState { targets: Targets::github("octocat"), http: reqwest::Client::new() });
    let app = Router::new().route("/download", get(download)).with_state(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

## Cache the answer

Every `verify_session` call is a live request to GitHub or Open Collective, and the API allows one refresh per
minute per session, shared with the client's own refreshes. Verify when something changes (a sign-in, the first
request of a session, a purchase) and keep the answer for a while, keyed on `supporter.id`, instead of verifying
on every request. See [cache the answer](../../guides/backend-verification.md#cache-the-answer).

## Sending the token from a Rust client

The Rust client doesn't have a session-token accessor yet. The token is the `sessionToken` field of the SDK's
state file, `<storage_dir>/<targets hash>.json` (see [where state is kept](platform-notes.md#where-state-is-kept)).
Set `storage_dir` yourself so you know where the file is, and read the token right before each request, because
the SDK renews it while it's in use:

```rust title="src/main.rs"
use std::path::{Path, PathBuf};

use sponsorkit::{Options, Sponsorkit};

/// The stored session token, read from the SDK's state file (`None` when signed out).
fn session_token(storage_dir: &Path, sk: &Sponsorkit) -> Option<String> {
    let file = storage_dir.join(format!("{}.json", sk.targets().hash()));
    let doc: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(file).ok()?).ok()?;
    doc["sessionToken"].as_str().map(str::to_owned)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Pick the directory yourself, so you know where the state file is.
    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or("HOME is not set")?;
    let dir = home.join(".config").join("my-cli").join("sponsorkit");
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        storage_dir: Some(dir.clone()),
        ..Default::default()
    })?;

    let mut req = reqwest::Client::new().get("https://api.example.com/download");
    if let Some(token) = session_token(&dir, &sk) {
        req = req.header("X-Sponsorkit-Session", token);
    }
    let res = req.send().await?;
    println!("{}", res.status());
    Ok(())
}
```

This needs `serde_json` and `reqwest` in your dependencies. The token is a bearer credential for the supporter's
contribution data on your targets, so send it only to your own backend, over HTTPS.
