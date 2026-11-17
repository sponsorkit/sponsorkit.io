---
title: Backend verification in Python
description: Check a supporter's session token on your server with verify_session() or averify_session(), and send the token from a Python client.
sidebar_label: Backend verification
order: 70
---

Anything decided on the user's machine can be patched out. For perks that cost you something (downloads,
hosted features, support), decide on your server: the client sends its session token, and the server asks
Sponsorkit with `verify_session()`. No API key or webhook is involved; the token itself is the credential, and it
is sealed by Sponsorkit so it can't be forged. The [backend verification guide](../../guides/backend-verification.md)
explains why this is safe.

```python
from sponsorkit.server import verify_session  # also importable from sponsorkit

fc = verify_session(token, {"github": "octocat", "opencollective": "my-collective"})
```

`verify_session()` calls `GET /api/v1/contributions` with the token, checks that the session belongs to **your**
targets, and returns the same `ContributionResult` the client gets, fresh from the API. It stores nothing and
reads no local state.

## On the server

A complete server with only the standard library; the same few lines fit in a Flask view, a Django view or a
FastAPI dependency:

```python title="server.py"
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from sponsorkit import SponsorkitError
from sponsorkit.server import verify_session

TARGETS = {"github": "octocat", "opencollective": "my-collective"}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        token = self.headers.get("X-Sponsorkit-Session", "")
        try:
            fc = verify_session(token, TARGETS)
        except SponsorkitError as e:
            if e.code in ("session_invalid", "targets_mismatch"):
                self.send_error(401, "Sign in to Sponsorkit again")
            else:  # network_error: Sponsorkit or the provider is unreachable
                self.send_error(503, "Try again later")
            return
        if not fc.active():
            self.send_error(402, "This download is for supporters")
            return
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"the good stuff\n")


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
```

### Arguments

| Argument | Default | Meaning |
|---|---|---|
| `token` | required | The session token (`sks_…`) from the client. Surrounding whitespace is ignored. |
| `targets` | required | Your targets as `{"github": …, "opencollective": …}`, a target string such as `"github:octocat,opencollective:my-collective"`, or a list of target strings. Normalized the same way as the client's options. |
| `api_base_url` | `"https://sponsorkit.io"` | For self-hosting and tests. |
| `request_timeout` | `30.0` | Seconds for the HTTP request; `0` disables the timeout. |
| `http_client` | a new client per call | An `httpx.Client` (`httpx.AsyncClient` for `averify_session`) to reuse connections, proxies or a test transport. Sponsorkit doesn't close it. |
| `timeout` | `None` | Deprecated alias of `request_timeout`. |

### Errors

| Code | When | Typical response |
|---|---|---|
| `session_invalid` | The token is empty, malformed, expired or revoked. | `401`: ask the user to sign in again. |
| `targets_mismatch` | The token is valid but bound to other targets (another app's session). | `401` or `403`. |
| `network_error` | Sponsorkit couldn't be reached, timed out, rate limited the request (`429`) or answered `5xx`. `e.retry_after` holds the API's `Retry-After` in seconds when it sent one. | `503`, or fall back to a cached answer. |
| `invalid_config` | `targets` or `request_timeout` is invalid. A bug in your server. | `500`. |

Unlike the client, `verify_session()` **does** raise on network problems, because a server has no cache of its
own to fall back on unless you keep one.

### Async frameworks

`averify_session()` takes the same arguments and uses `httpx.AsyncClient`. Reuse one client across requests:

```python title="verify.py"
import httpx

from sponsorkit import ContributionResult
from sponsorkit.server import averify_session

client = httpx.AsyncClient()  # reuse one client across requests


async def check(token: str) -> ContributionResult:
    return await averify_session(token, "github:octocat", http_client=client, request_timeout=5)
```

### Don't verify on every request

Every call is a live query to GitHub or Open Collective, and the API allows one refresh per minute per session
(more get `429`, which surfaces as `network_error`); that limit is shared with the client's own refreshes. Verify
at sign-in or at the first request of a session, then keep the answer for a while keyed on `fc.supporter.id`,
which is stable for the same person and targets. See [Key users on
`supporter.id`](../../guides/backend-verification.md#key-users-on-supporterid).

## Sending the token from a Python client

The Python client has no accessor for its session token yet. The token is the `sessionToken` field of the
[state file](platform-notes.md#where-state-is-kept), whose format every Sponsorkit SDK shares, so you can read it
with the public storage helpers:

```python title="client.py"
import json

import httpx

from sponsorkit import FileStorage, Sponsorkit, default_storage_dir

sk = Sponsorkit(github="octocat", opencollective="my-collective", app_name="my-cli")


def session_token(sk: Sponsorkit) -> str | None:
    """The stored session token (sks_...), or None when signed out.

    Reads the storage file every Sponsorkit SDK shares: <storage dir>/<targets_hash>.json.
    """
    directory = default_storage_dir()  # pass your storage_dir here if you set one
    if directory is None:
        return None
    text = FileStorage(directory).read(sk.targets_hash)
    if text is None:
        return None
    token = json.loads(text).get("sessionToken")
    return token if isinstance(token, str) else None


token = session_token(sk)
headers = {"X-Sponsorkit-Session": token} if token else {}
response = httpx.get("https://api.example.com/download", headers=headers)
print(response.status_code)
```

Send the token only to your own backend, over HTTPS: it's a bearer credential for the supporter's contribution
data on your targets. The client keeps it fresh on its own (sessions last 180 days and are renewed while in use),
so read it again before each request rather than caching it.
