# sponsorkit (Python)

Build **GitHub Sponsors** and **Open Collective** contributions directly into your Python software.
No Sponsorkit account, no API key, no webhook: name the account(s) you receive sponsorships on, ask
what the current user has contributed, and write your own rule.

```python
from sponsorkit import Sponsorkit

sk = Sponsorkit(github="octocat", opencollective="my-project", app_name="my-cli")

fc = sk.get_financial_contribution()
if fc.signed_in and not any(c.amount.currency == "USD" and c.amount.value >= 500 for c in fc.active()):
    show_ad()
```

- Python 3.10+, one runtime dependency (`httpx`), fully typed (`py.typed`).
- Sync API plus `a`-prefixed async variants (`aget_financial_contribution`, `asign_in`, …).
- Never breaks your app: network and server problems return cached or stale data instead of raising.

## Install

```sh
pip install sponsorkit
```

## Quickstart (CLI)

```python
import sys
from sponsorkit import Sponsorkit, SponsorkitError

sk = Sponsorkit(github="octocat", app_name="my-cli")

if "--sponsor-login" in sys.argv:
    try:
        sk.sign_in()                      # opens the browser (or prints a URL over SSH)
    except SponsorkitError as e:
        print(f"Sign-in failed: {e.code}", file=sys.stderr)

fc = sk.get_financial_contribution()     # cached locally for an hour
if fc.active():
    print("Thanks for supporting my-cli! ♥")

if "--sponsor" in sys.argv:
    result = sk.open_checkout(frequency="monthly", amount=500)   # $5.00/month
    if result.status == "contributed":
        print("Thank you!", result.contribution.amount)
```

## API reference

### `Sponsorkit(github=None, opencollective=None, *, ...)`

Constructing never performs I/O. It raises `SponsorkitError("invalid_config")` for missing or
malformed targets and invalid options (even when Sponsorkit is disabled).

| Option | Default | Meaning |
|---|---|---|
| `github` / `opencollective` | – | The account(s) you receive sponsorships on. At least one; case and whitespace are normalized. |
| `app_name` | `None` | Shown on the consent page as "says it is" (≤ 64 chars). |
| `cache_ttl` | `3600` | Seconds a result is served from the local cache (minimum 60). |
| `mock` | `None` | Preset name or `{"contributions": [...]}` (see [Mock mode](#mock-mode-and-testing)). |
| `storage_dir` | per-user config dir | Where state files live (see [Local storage](#local-storage)). |
| `storage` | `FileStorage(storage_dir)` | Custom backend implementing the `Storage` protocol (`read`/`write`/`delete`). |
| `api_base_url` | `https://sponsorkit.io` | Self-hosting and tests. |
| `sign_in_method` | `"auto"` | `"auto"`, `"loopback"` or `"paste"`. |
| `open_browser` | `webbrowser.open` | `open_browser(url)`; return `False` or raise if it could not open. |
| `prompt_for_code` | read a line from stdin | `prompt_for_code(url) -> str` for paste-back sign-in. |
| `env` | `os.environ` | Where `SPONSORKIT_DISABLE`, `SPONSORKIT_MOCK`, `SPONSORKIT_NO_NAG` and `CI` are read. |
| `dev_checks` | `sys.flags.dev_mode` | Check once per process that the targets exist (`GET /api/v1/targets`); raises `invalid_config` on the first call that does I/O. Enable it while developing. |
| `checkout_poll_interval` | `60.0` | Seconds between checks while waiting for a checkout. |
| `clock` | `datetime.now(utc)` | Injectable time source (cache TTL, nag, `Retry-After`). |
| `timeout` | `10.0` | HTTP timeout in seconds. |
| `http_client` | own `httpx.Client` | Reuse your own client (proxies, custom transports). Call `sk.close()` or use `with Sponsorkit(...) as sk:` to release the one Sponsorkit creates. |

### Methods

| Sync | Async | Description |
|---|---|---|
| `get_financial_contribution(*, cache_ttl=None)` | `aget_financial_contribution` | The current `ContributionResult`. `cache_ttl=0` forces a refresh. Never raises for network/server problems. |
| `sign_in(provider=None, *, method=None, timeout=300, cancel=None)` | `asign_in` | Signs in, or adds a second provider identity when already signed in. Returns the fresh result. |
| `is_signed_in()` | `ais_signed_in` | Whether a session is stored. No network. |
| `open_checkout(*, provider, amount, currency, frequency, timeout=600, cancel=None, method=None, poll_interval=None)` | `aopen_checkout` | Signs in if needed, opens the checkout page, then polls until a new or changed contribution appears. Returns `CheckoutResult("contributed", contribution)` or `CheckoutResult("unknown")` on timeout/cancellation. |
| `checkout_url(*, provider, amount, currency, frequency)` | – | Offline, synchronous link to the checkout page (no sign-in). Great for nags and READMEs. |
| `sign_out()` | `asign_out` | Deletes the stored token and cache locally (nag state is kept). No network. |
| `nag(id, *, every=10, or_every=None)` | – | A [`Nag`](#nag-helper). |

`amount` is always in **minor units** (cents); `currency` is ISO 4217 (`"USD"`, `"EUR"`);
`frequency` is `"one_time"`, `"monthly"` or `"yearly"`.

**Cancellation.** Sync calls take a `threading.Event` as `cancel`. Async calls accept an
`asyncio.Event` or a `threading.Event`; cancelling the awaiting task also stops the work (and
propagates `CancelledError`). The async variants run the blocking implementation in a worker
thread (`asyncio.to_thread`), so they are safe to call from any event loop.

### `ContributionResult`

Frozen dataclass mirroring the JSON shape every Sponsorkit SDK returns (snake_case attributes,
`to_dict()` gives the camelCase JSON):

```python
fc.signed_in, fc.disabled, fc.mock, fc.targets, fc.supporter, fc.contributions,
fc.fetched_at, fc.stale, fc.from_cache

fc.active()             # status == "active"
fc.recurring()          # kind == "recurring"
fc.one_time()           # kind == "one_time"
fc.by_provider("github")
fc.direct()             # excludes organization sponsorships
```

Each `Contribution` has `id`, `provider`, `target`, `sponsor`, `via` (`direct`/`organization`),
`kind`, `frequency`, `status` (`active`, `paused`, `cancelled`, `paid`, `refunded`, `disputed`,
`failed`, `pending`), `amount` (`Money(value, currency)`), `tier`, `flags`, `private`,
`started_at`, `ended_at`, `last_charged_at`, `next_charge_at`, `total_contributed`.
Helpers never sum across providers or currencies.

### Errors

Everything raised is a `SponsorkitError` with a stable `.code`:

| Code | When |
|---|---|
| `invalid_config` | No/malformed targets, invalid option, unknown mock preset, or (dev check) a target that doesn't exist. |
| `disabled` | `sign_in` / `open_checkout` while `SPONSORKIT_DISABLE` is set. |
| `access_denied`, `invalid_state`, `provider_error` | Sign-in error delivered by the sign-in page. |
| `invalid_code` | The sign-in code could not be exchanged. |
| `timeout`, `cancelled` | Sign-in did not complete (5 min default) or was cancelled. |
| `network_error`, `internal` | Sign-in or `verify_session` could not reach the API / got an unexpected response. |
| `session_invalid`, `targets_mismatch` | Only from `verify_session`. |

`get_financial_contribution()` never raises for network errors, `5xx` or `429`: it returns the
cached result (`from_cache=True, stale=True`), or a signed-in empty result with `stale=True`, and
honours `Retry-After` for the rest of the process. An invalid session clears the token and returns
the signed-out result. `SPONSORKIT_DISABLE=1` turns everything into a no-op (`disabled=True`).

## Sign-in

- **Loopback** (desktop): listens on `127.0.0.1:<random>/callback`, opens the browser, waits up to
  5 minutes for the code, exchanges it with its PKCE verifier.
- **Paste-back** (SSH, containers): prints a `https://sponsorkit.io/connect?…&delivery=paste` URL to
  stderr and asks for the code shown in the browser (valid for 10 minutes).
- **`auto`** (default) picks paste-back when `SSH_CONNECTION`/`SSH_TTY` is set or there is no
  display, and falls back to it if the browser can't be opened.

`sk.sign_in("opencollective")` while signed in with GitHub adds the second identity to the same
session.

## Nag helper

```python
import sys

nag = sk.nag("my-cli", every=10, or_every="P7D")   # every 10 runs, or weekly
if nag.due(lambda fc: not fc.active()):
    print(f"❤️ Enjoying my-cli? Support it: {sk.checkout_url(frequency='monthly')}", file=sys.stderr)
    nag.shown()
```

- The run counter goes up once per process per `id`, on the first `due()` call.
- `due()` returns `predicate(fc) and (runs >= every or time_since(last_shown) >= or_every)`.
  `shown()` resets the counter and records the time. `or_every` takes an ISO-8601 duration or a
  `timedelta`.
- `due()` is always `False` when `SPONSORKIT_DISABLE`, `SPONSORKIT_NO_NAG` or `CI` is set, or when
  stdout/stderr isn't a TTY, unless you pass `force=True` (which still respects
  `SPONSORKIT_DISABLE`). It never signs anyone in. Async: `await nag.adue(...)`, `await nag.ashown()`.

## Backend verification

A backend never needs a key: have the client send its session token and verify it.

```python
from sponsorkit import SponsorkitError
from sponsorkit.server import verify_session, averify_session

try:
    fc = verify_session(token, {"github": "octocat"})       # or await averify_session(...)
except SponsorkitError as e:
    if e.code in ("session_invalid", "targets_mismatch"):
        raise PermissionError from e
    raise                                                  # network_error / internal
if fc.active():
    grant_pro()
```

`verify_session` calls `GET /api/v1/contributions` with the token, checks that the session is bound
to exactly your targets, and touches no local storage. On the client side, the token is the
`sessionToken` in the storage file described below.

## Mock mode and testing

```python
Sponsorkit(github="octocat", mock="active-monthly")
# presets: signed-out | none | active-monthly | one-time | cancelled | org
Sponsorkit(github="octocat", mock={"contributions": [ { ...contribution JSON... } ]})
```

```sh
SPONSORKIT_MOCK=active-monthly my-cli     # same presets via the environment
SPONSORKIT_DISABLE=1 my-cli               # disable Sponsorkit entirely (beats mock)
SPONSORKIT_NO_NAG=1 my-cli                # never nag
```

Mock mode performs no network or disk access; `sign_in()` and `open_checkout()` resolve
immediately (checkout simulates a new contribution). The `mock` option beats `SPONSORKIT_MOCK`.

For tests of your own code, inject `env={}`, `storage=MemoryStorage()`, `clock=...`,
`open_browser=...`, `prompt_for_code=...` and `api_base_url=...`, and call
`sponsorkit.reset_process_state()` between tests to forget per-process memos (nag runs counted,
dev check, `Retry-After`).

## Local storage

One JSON file per target set, `<storage_dir>/<sha256(target param)>.json`:

```json
{ "v": 1, "sessionToken": "sks_…", "cache": { "result": { … }, "storedAt": "2026-11-16T18:00:00.000Z" },
  "nags": { "my-cli": { "runs": 3, "lastShown": null } } }
```

Default directory: `$XDG_CONFIG_HOME/sponsorkit` (Linux), `~/Library/Application Support/sponsorkit`
(macOS), `%APPDATA%\sponsorkit` (Windows). The directory is created `0700`, files are `0600`, and
writes are atomic (temp file + rename). The format is shared by every Sponsorkit SDK.

## Development

```sh
cd sdks/python
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/pytest            # unit tests + the full conformance suite (needs `bun` on PATH)
.venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy
```

The conformance suite starts `sdks/conformance/server.ts` (the fake Sponsorkit API) and runs every
scenario in `sdks/conformance/scenarios.json` twice: `test_conformance[<id>]` through the sync API
and `test_conformance_async[<id>]` through the async variants.

## License

MIT
