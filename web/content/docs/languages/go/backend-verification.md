---
title: Backend verification in Go
description: Check a supporter on your Go server with sponsorkit.VerifySession, using the session token your client forwards.
sidebar_label: Backend verification
order: 70
---

Anything decided on the user's machine can be patched out. For perks that cost you something (a hosted service,
an API, a download), let your server decide. Sponsorkit needs no key on the server either: your client forwards
its session token, and the server asks Sponsorkit what that session's supporter contributed to *your* targets.
[How it works](../../guides/backend-verification.md#how-it-works) explains the model.

## On the server

```go title="server.go"
package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

var targets = sponsorkit.Targets{GitHub: "octocat"}

func proFeature(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Sponsorkit ")
	fc, err := sponsorkit.VerifySession(r.Context(), token, targets)
	switch sponsorkit.ErrorCodeOf(err) {
	case "":
	case sponsorkit.CodeSessionInvalid, sponsorkit.CodeTargetsMismatch:
		http.Error(w, "sign in again", http.StatusUnauthorized)
		return
	case sponsorkit.CodeNetworkError:
		var skErr *sponsorkit.Error
		if errors.As(err, &skErr) && skErr.RetryAfter != nil {
			w.Header().Set("Retry-After", fmt.Sprint(int(skErr.RetryAfter.Seconds())))
		}
		http.Error(w, "try again later", http.StatusServiceUnavailable)
		return
	default:
		log.Print(err) // invalid_config: your targets are malformed
		http.Error(w, "server misconfigured", http.StatusInternalServerError)
		return
	}
	if len(fc.Active()) == 0 {
		http.Error(w, "sponsors only", http.StatusForbidden)
		return
	}
	fmt.Fprintf(w, "welcome, sponsor %s\n", fc.Supporter.ID)
}

func main() {
	http.HandleFunc("/api/pro-feature", proFeature)
	log.Fatal(http.ListenAndServe("127.0.0.1:8080", nil))
}
```

`VerifySession(ctx, token, targets, opts...)` calls `GET /api/v1/contributions` with the token and checks that
the session was made for exactly your target set. It uses no local storage and no cache, so every call is one
request: cache the answer yourself if you call it often ([see below](#caching-the-answer)). Pass the request's
context so a client that disconnects cancels the call.

### Errors

| Code | Meaning | Typical response |
|---|---|---|
| `session_invalid` | The token is missing, malformed, expired or revoked. | 401: ask the user to sign in again. |
| `targets_mismatch` | The session belongs to a different target set (another app's token). | 401. |
| `network_error` | Sponsorkit couldn't be reached, timed out, or answered 5xx, 429 or something unexpected. `RetryAfter` is set when it sent `Retry-After`. | 503, or fall back to a recent cached answer. |
| `invalid_config` | Your `targets` are malformed, or `WithAPIBaseURL` isn't an http(s) URL. | A bug to fix. |

### Options

| Option | Default | Meaning |
|---|---|---|
| `sponsorkit.WithAPIBaseURL(u)` | `https://api.sponsorkit.io` | The API origin, for [self-hosting](../../reference-http/self-hosting.md) and tests. |
| `sponsorkit.WithHTTPClient(hc)` | `&http.Client{}` | The HTTP client to use. |
| `sponsorkit.WithRequestTimeout(d)` | 30 s | Bounds the request, including reading the response. `sponsorkit.NoRequestTimeout` disables it. A timeout is `network_error`. |

## On the client

Send the token with each request to your server. `SessionToken()` returns it, or `""` when signed out, disabled
or in mock mode:

```go title="client.go"
package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"

	sponsorkit "github.com/sponsorkit/sponsorkit.io/sdks/go"
)

func main() {
	ctx := context.Background()
	sk, err := sponsorkit.New(sponsorkit.Options{GitHub: "octocat", AppName: "my-cli"})
	if err != nil {
		log.Fatal(err)
	}
	token := sk.SessionToken()
	if token == "" {
		if _, err := sk.SignIn(ctx); err != nil {
			log.Fatal(err)
		}
		token = sk.SessionToken()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://127.0.0.1:8080/api/pro-feature", nil)
	if err != nil {
		log.Fatal(err)
	}
	req.Header.Set("Authorization", "Sponsorkit "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	fmt.Println(res.Status, string(body))
}
```

The header name and scheme are up to you; the example uses `Authorization: Sponsorkit <token>`. Always send the
token over HTTPS, and don't log it: it grants read access to the supporter's contributions to your targets
([what a token can do](../../concepts/security.md#what-a-session-token-can-do)).

## Caching the answer

Key what you store on `fc.Supporter.ID`, which is stable for the same person and target set, rather than on a
handle. Supporters' contributions change rarely, so caching a verified answer per token for a few minutes keeps
your server fast and well within [rate limits](../../reference-http/http-api.md#rate-limits). When `VerifySession`
returns `network_error`, serving a recent cached answer is usually kinder than failing.

The [backend verification guide](../../guides/backend-verification.md) shows the same flow in every language and
without an SDK.
