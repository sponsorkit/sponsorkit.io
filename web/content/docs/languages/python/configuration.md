---
title: Configuring the Python SDK
description: Every Sponsorkit constructor option with its default, how options are validated, and the environment variables the SDK reads.
sidebar_label: Configuration
order: 10
---

All configuration goes into the `Sponsorkit` constructor. Only `github` and `opencollective` are positional;
everything else is keyword-only. The constructor validates everything up front and does no I/O: a missing
target or a malformed option raises `SponsorkitError` with code `invalid_config` on that line, even when
Sponsorkit is disabled, so mistakes show up the first time you run your program rather than at sign-in.

```python title="config.py"
from pathlib import Path

from sponsorkit import Sponsorkit

sk = Sponsorkit(
    github="octocat",
    opencollective="my-collective",
    app_name="my-cli",
    cache_ttl=6 * 3600,  # seconds; values below 60 are raised to 60
    storage_dir=Path.home() / ".my-cli" / "sponsorkit",
    sign_in_timeout=120,
    request_timeout=10,
)
print(sk.targets)  # ('github:octocat', 'opencollective:my-collective')
```

## Options

| Option | Default | What it does |
|---|---|---|
| `github` | `None` | GitHub Sponsors login (user or organization) to check. Case and surrounding whitespace are normalized. |
| `opencollective` | `None` | Open Collective collective slug to check. At least one of `github` and `opencollective` is required. |
| `app_name` | `None` | Your app's name, shown on the consent page as "says it is". At most 64 characters. |
| `cache_ttl` | `3600` | Seconds a result is served from the local cache without asking the API. Values below `60` are raised to `60`; a single call can ask for fresher data. See [Contributions](contributions.md#caching). |
| `mock` | `None` | Mock mode: a preset name (`"signed-out"`, `"none"`, `"active-monthly"`, `"one-time"`, `"cancelled"`, `"org"`) or `{"contributions": [...]}`. No network or disk access. Takes precedence over `SPONSORKIT_MOCK`. See [Testing](testing.md#mock-mode). |
| `storage` | file storage | A custom backend implementing the `Storage` protocol (`read`, `write`, `delete`). |
| `storage_dir` | per-user config directory | Directory for the state files. Ignored when `storage` is given. See [Platform notes](platform-notes.md#where-state-is-kept). |
| `api_base_url` | `"https://api.sponsorkit.io"` | The API origin, used for every API call, for [self-hosting](/docs/reference-http/self-hosting) and tests. Must be an `http` or `https` URL. An empty string counts as unset. |
| `site_base_url` | `"https://sponsorkit.github.io/sponsorkit.io"`, or `api_base_url` when only that is set | The site base URL (origin plus optional path), used for the `/connect/` and `/checkout/` pages, `checkout_url()` and the loopback checkout redirect. Must be an `http` or `https` URL; trailing slashes are trimmed. An empty string counts as unset. |
| `sign_in_method` | `"auto"` | `"auto"`, `"loopback"` or `"paste"`. See [Sign-in](sign-in.md#choosing-a-method). |
| `sign_in_timeout` | `300.0` | Seconds to wait for a loopback or paste-back sign-in before raising `timeout`. Must be positive. |
| `open_browser` | system launcher | `open_browser(url)` opens the consent and checkout pages. Return `False` or raise to say it couldn't. |
| `prompt_for_code` | read a line from stdin | `prompt_for_code(url) -> str` returns the code for paste-back sign-in. An empty string cancels. |
| `interactive` | TTY detection | Overrides the "are stdout and stderr terminals?" check used by the [nag helper](nag.md). |
| `env` | `os.environ` | Where the `SPONSORKIT_*` variables and `CI` are read. A mapping given here **replaces** the process environment for those variables; it isn't merged. |
| `dev_checks` | see below | `True` or `False` forces the development-time check that your targets exist. |
| `checkout_poll_interval` | `60.0` | Seconds between checks while `open_checkout()` waits for a new contribution. Must be positive. |
| `clock` | `datetime.now(timezone.utc)` | A zero-argument callable returning the current time. Used for cache age, nag timing and `Retry-After`. Naive datetimes count as UTC. |
| `request_timeout` | `30.0` | Timeout in seconds for every HTTP request; `0` disables it. Also applied to a custom `http_client`. A timeout counts as a network error. |
| `http_client` | a client of its own | An `httpx.Client` for API calls, to reuse your proxy or transport settings. |
| `timeout` | `None` | Deprecated alias of `request_timeout`. |

What is checked: `cache_ttl` must be a finite non-negative number, `sign_in_timeout` and `checkout_poll_interval`
finite positive numbers, `storage_dir` a `str` or `os.PathLike`, `request_timeout` a finite number of seconds `>= 0`, `interactive` a `bool` or `None`,
`sign_in_method` one of the three names, `app_name` at most 64 characters, and `mock` a known preset or a
well-formed contribution list (it is parsed even when mock mode is off because of `SPONSORKIT_DISABLE`).

### The HTTP client

When you don't pass `http_client`, the client creates an `httpx.Client` on first use and keeps it for
connection reuse. Release it with `close()`, or use the client as a context manager:

```python
from sponsorkit import Sponsorkit

with Sponsorkit(github="octocat") as sk:
    fc = sk.get_financial_contribution()
```

A client you pass in stays yours: Sponsorkit never closes it.

### Development checks

With development checks on, the first call that does I/O (`get_financial_contribution()`, `sign_in()` or
`open_checkout()`) asks the API whether your targets exist and raises `invalid_config` if one doesn't. This
catches a misspelled account name before you ship. The check runs once per process and fails open: when the API
can't be reached, nothing is raised.

They are on when `SPONSORKIT_DEV_CHECKS` is set or Python runs in
[development mode](https://docs.python.org/3/library/devmode.html) (`python -X dev` or `PYTHONDEVMODE=1`), and
off otherwise. `dev_checks=True` or `dev_checks=False` overrides both.

## Environment variables

Your users can control Sponsorkit without any code from you. A variable counts as set when it is non-empty and
not `0` or `false` (in any case).

| Variable | Effect |
|---|---|
| `SPONSORKIT_DISABLE` | Turns Sponsorkit off: `get_financial_contribution()` returns `disabled=True` with no contributions, `sign_in()` and `open_checkout()` raise `disabled`, nags are never due, and nothing touches the network or disk. Beats mock mode. |
| `SPONSORKIT_MOCK` | A mock preset name, as for the `mock` option (which wins when both are given). An unknown name raises `invalid_config`. |
| `SPONSORKIT_NO_NAG` | Nags are never due (unless `due(force=True)`). |
| `CI` | Same as `SPONSORKIT_NO_NAG`. CI services set it. |
| `SPONSORKIT_DEV_CHECKS` | Turns on the development-time target check. |

These are read from `env` when you pass it, otherwise from `os.environ`. Two
variables are always read from the process environment because they describe the machine rather than your
configuration: `SSH_CONNECTION`/`SSH_TTY` and `DISPLAY`/`WAYLAND_DISPLAY`, which the `auto` sign-in method uses
to choose [paste-back](sign-in.md#choosing-a-method). `BROWSER` selects the browser as described in
[Platform notes](platform-notes.md#opening-the-browser).

## Inspecting a client

| Property | Example | Meaning |
|---|---|---|
| `targets` | `("github:octocat", "opencollective:my-collective")` | The canonical, sorted target strings. |
| `targets_param` | `"github:octocat,opencollective:my-collective"` | The same, joined, as used in URLs. |
| `targets_hash` | 64 hex characters | SHA-256 of `targets_param`: the name of the state file. |
| `disabled` | `False` | Whether `SPONSORKIT_DISABLE` is set. |
| `mock` | `False` | Whether mock mode is on (and not overridden by `SPONSORKIT_DISABLE`). |

Every option and property is also in the [`Sponsorkit` API reference](/docs/reference/python/sponsorkit).
