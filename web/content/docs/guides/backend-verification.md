---
title: Verify supporters on your backend
description: Get a trustworthy answer on your server by forwarding the supporter's session token and verifying it, with no API key.
order: 60
---

Anything your app checks on the user's machine can be patched out. When a feature costs you something (a hosted
service, storage, API quota), decide on your server instead. Your backend doesn't need an API key or a webhook:
the client forwards its session token, and the backend asks Sponsorkit about it.

## How it works

1. The supporter signs in through your app as usual. The SDK stores a session token (`sks_…`).
2. Your app sends that token to your backend, for example in a request header.
3. Your backend calls `verifySession(token, targets)`. It sends the token to
   `GET /api/v1/contributions` and gets the live contributions back.
4. `verifySession` checks that the session was issued for **your** targets, then returns the same result type
   as `getFinancialContribution()`.

The token can't be forged or edited: it's encrypted and authenticated with a key only Sponsorkit has, and it
contains the targets it was issued for. Step 4 matters because a token from a different app (with different
targets) is just as genuine; it just isn't about you.

## Verify on the server

:::tabs
```ts title="server.ts"
import { isSponsorkitError, verifySession } from "@sponsorkit/sdk/server";

// A fetch-style handler: works in Node 20+, Bun, Deno and Cloudflare Workers.
export async function handleDownload(request: Request): Promise<Response> {
  const token = request.headers.get("X-Sponsorkit-Session") ?? "";
  try {
    const fc = await verifySession(token, { github: "octocat", opencollective: "my-project" });
    if (fc.active().length === 0) return new Response("Sponsors only", { status: 403 });
    return new Response(`Here you go, ${fc.supporter?.id}`);
  } catch (e) {
    if (isSponsorkitError(e, "session_invalid") || isSponsorkitError(e, "targets_mismatch")) {
      return new Response("Please sign in again", { status: 401 });
    }
    if (isSponsorkitError(e, "network_error")) {
      return new Response("Try again later", { status: 503, headers: { "Retry-After": String(e.retryAfter ?? 60) } });
    }
    throw e;
  }
}
```
```csharp title="Program.cs"
using Sponsorkit;

static async Task<(int Status, string Body)> HandleDownloadAsync(string? token, CancellationToken ct)
{
    try
    {
        var fc = await SponsorkitServer.VerifySessionAsync(
            token ?? "",
            new VerifySessionOptions { GitHub = "octocat", OpenCollective = "my-project" },
            ct);
        return fc.Active().Count > 0 ? (200, $"Here you go, {fc.Supporter?.Id}") : (403, "Sponsors only");
    }
    catch (SponsorkitError e) when (e.Code is SponsorkitErrorCodes.SessionInvalid or SponsorkitErrorCodes.TargetsMismatch)
    {
        return (401, "Please sign in again");
    }
    catch (SponsorkitError e) when (e.Code == SponsorkitErrorCodes.NetworkError)
    {
        return (503, $"Try again in {e.RetryAfter?.TotalSeconds ?? 60} seconds");
    }
}

var (status, body) = await HandleDownloadAsync(args.FirstOrDefault(), CancellationToken.None);
Console.WriteLine($"{status} {body}");
```
```python title="server.py"
from sponsorkit import SponsorkitError, verify_session


def handle_download(token: str) -> tuple[int, str]:
    try:
        fc = verify_session(token, {"github": "octocat", "opencollective": "my-project"})
    except SponsorkitError as e:
        if e.code in ("session_invalid", "targets_mismatch"):
            return 401, "Please sign in again"
        if e.code == "network_error":
            return 503, f"Try again in {e.retry_after or 60} seconds"
        raise
    if not fc.active():
        return 403, "Sponsors only"
    return 200, f"Here you go, {fc.supporter.id if fc.supporter else ''}"
```
```go title="main.go"
package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

var targets = sponsorkit.Targets{GitHub: "octocat", OpenCollective: "my-project"}

func handleDownload(w http.ResponseWriter, r *http.Request) {
	token := r.Header.Get("X-Sponsorkit-Session")
	fc, err := sponsorkit.VerifySession(r.Context(), token, targets)
	switch sponsorkit.ErrorCodeOf(err) {
	case "":
	case sponsorkit.CodeSessionInvalid, sponsorkit.CodeTargetsMismatch:
		http.Error(w, "Please sign in again", http.StatusUnauthorized)
		return
	case sponsorkit.CodeNetworkError:
		retry := 60
		var skErr *sponsorkit.Error
		if errors.As(err, &skErr) && skErr.RetryAfter != nil {
			retry = int(skErr.RetryAfter.Seconds())
		}
		w.Header().Set("Retry-After", strconv.Itoa(retry))
		http.Error(w, "Try again later", http.StatusServiceUnavailable)
		return
	default:
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	if len(fc.Active()) == 0 {
		http.Error(w, "Sponsors only", http.StatusForbidden)
		return
	}
	fmt.Fprintf(w, "Here you go, %s\n", fc.Supporter.ID)
}

func main() {
	http.HandleFunc("/download", handleDownload)
	log.Fatal(http.ListenAndServe("127.0.0.1:8080", nil))
}
```
```rust title="main.rs"
use sponsorkit::{ErrorCode, Targets, server::verify_session};

async fn handle_download(token: &str) -> (u16, String) {
    let targets = Targets::github("octocat").with_opencollective("my-project");
    match verify_session(token, &targets).await {
        Ok(fc) if fc.active().is_empty() => (403, "Sponsors only".into()),
        Ok(fc) => {
            let id = fc.supporter.as_ref().map(|s| s.id.clone()).unwrap_or_default();
            (200, format!("Here you go, {id}"))
        }
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
:::

`verifySession` touches no local storage and keeps no cache: every call asks Sponsorkit live. That's what makes it
trustworthy, and also why you should cache the answer yourself (see [below](#cache-the-answer)).

### Errors

| Code | Meaning | Suggested response |
|---|---|---|
| `session_invalid` | The token is missing, malformed, expired, tampered with or sealed with a retired key. | `401`: ask the user to sign in again. |
| `targets_mismatch` | The token is genuine but was issued for a different set of targets. | `401` or `403`. |
| `network_error` | Sponsorkit couldn't be reached, timed out, or answered 5xx, 429 or something unexpected. `retryAfter` holds the seconds from `Retry-After` when the API sent one. | `503`, and retry later. |
| `invalid_config` | Your `targets` argument is missing or malformed. | Fix your code. |

Unlike `getFinancialContribution()`, `verifySession` **does** throw on network problems. On a client, a stale
answer is better than a crash; on a server deciding access, "I don't know" must be visible so you can choose
whether to fail open or closed.

### Options

Every SDK accepts the API origin (for [self-hosting](../reference-http/self-hosting.md)) and a request timeout
(30 seconds by default; `0` disables it). Most also take your own HTTP client:

| Language | Call |
|---|---|
| JavaScript | `verifySession(token, targets, { apiBaseUrl, fetch, signal, requestTimeout })` |
| .NET | `SponsorkitServer.VerifySessionAsync(token, new VerifySessionOptions { GitHub, OpenCollective, ApiBaseUrl, HttpClient, RequestTimeout }, ct)` |
| Python | `verify_session(token, targets, api_base_url=…, request_timeout=…, http_client=…)`, or `await averify_session(…)` |
| Go | `sponsorkit.VerifySession(ctx, token, targets, sponsorkit.WithAPIBaseURL(…), sponsorkit.WithHTTPClient(…), sponsorkit.WithRequestTimeout(…))` |
| Rust | `server::verify_session_with(token, &targets, VerifyOptions { api_base_url, http_client, request_timeout })` |

In JavaScript, `targets` can also be a canonical target string such as `"github:octocat,opencollective:my-project"`.

## Send the token from the client

The token is a bearer credential for the supporter's contribution data on your targets, so send it only to your
own backend, over HTTPS.

:::tabs
```ts title="client.ts"
import { Sponsorkit } from "@sponsorkit/sdk";

const sk = new Sponsorkit({ github: "octocat", opencollective: "my-project" });

export async function download(): Promise<Response> {
  const token = await sk.getSessionToken(); // null when signed out
  return fetch("/download", { headers: token ? { "X-Sponsorkit-Session": token } : {} });
}
```
```go title="main.go"
package main

import (
	"log"
	"net/http"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", OpenCollective: "my-project", AppName: "my-cli"})
	if err != nil {
		log.Fatal(err)
	}

	req, err := http.NewRequest("GET", "https://api.example.com/download", nil)
	if err != nil {
		log.Fatal(err)
	}
	if token := sk.SessionToken(); token != "" { // "" when signed out
		req.Header.Set("X-Sponsorkit-Session", token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Fatal(err)
	}
	defer res.Body.Close()
	log.Println(res.Status)
}
```
:::

The JavaScript (`getSessionToken()`) and Go (`SessionToken()`) clients expose the stored token. The .NET, Python
and Rust clients don't have an accessor yet; the token is the `sessionToken` field of the
[storage file](native-apps.md#where-state-is-kept). The client keeps the token fresh on its own: sessions last 180
days and are renewed while they're being used.

## Key users on `supporter.id`

`supporter.id` (`sup_…`) is stable for the same person and the same set of targets, so you can use it as the key
for a user record or an entitlement in your database. It's derived from the person's first sign-in identity, so
connecting a second provider later doesn't change it.

It's also **pairwise**: apps with different targets get different ids for the same person, so ids can't be used
to track people across apps. It isn't their GitHub or Open Collective user id.

## Cache the answer

Every `verifySession` call is a live request to GitHub or Open Collective, and the API allows one refresh per
minute per session (more requests get `429` and a `network_error`). That limit is shared with the client's own
refreshes, because they use the same session. Verify when something changes (a sign-in, the
first request of a session, a purchase) and keep the answer for a while, keyed on `supporter.id`, instead of
verifying on every request.

## Without an SDK

`verifySession` is a thin wrapper around one HTTP call. In another language, do it yourself:

```bash
curl https://sponsorkit.io/api/v1/contributions \
  -H "Authorization: Bearer sks_…"
```

Then compare the `targets` array in the response with your own canonical targets (lowercased, sorted, for example
`["github:octocat", "opencollective:my-project"]`), and treat `401` as `session_invalid`. The response is
described in the [HTTP API reference](../reference-http/http-api.md#get-contributions).
