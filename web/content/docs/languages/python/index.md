---
title: Sponsorkit for Python
description: Install and use the sponsorkit package in command-line tools, desktop apps, services and async code on Python 3.10+.
sidebar_label: Overview
---

`sponsorkit` tells your Python program what the current user has contributed to your GitHub Sponsors and Open
Collective accounts, and sends them to contribute. It is made for software that one person runs on their own
machine: command-line tools, desktop apps, Jupyter extensions, editor plugins. It also has a helper that lets
a web backend check a supporter's session.

- Python 3.10 or later, on Linux, macOS and Windows.
- One runtime dependency: [httpx](https://www.python-httpx.org/).
- Fully typed (ships `py.typed`), so mypy and Pyright check your calls.
- A blocking API, plus an `a`-prefixed async variant of every blocking method (`asign_in`,
  `aget_financial_contribution`, …) for asyncio code.

## Install

::::tabs{group="pypi"}
:::tab[pip]{key="pip"}
```bash title="Terminal"
python -m pip install sponsorkit
```
:::
:::tab[uv]{key="uv"}
```bash title="Terminal"
uv add sponsorkit
```
:::
:::tab[Poetry]{key="poetry"}
```bash title="Terminal"
poetry add sponsorkit
```
:::
:::tab[PDM]{key="pdm"}
```bash title="Terminal"
pdm add sponsorkit
```
:::
:::tab[Pipenv]{key="pipenv"}
```bash title="Terminal"
pipenv install sponsorkit
```
:::
:::tab[pyproject.toml]{key="pyproject"}
Any build backend (Hatch, setuptools, Flit, PDM, Poetry 2) reads the standard `[project]` table:

```toml title="pyproject.toml"
[project]
dependencies = [
  "sponsorkit>=0.1,<0.2",
]
```
:::
:::tab[requirements.txt]{key="requirements"}
```text title="requirements.txt"
sponsorkit>=0.1,<0.2
```
:::
::::

Sponsorkit is a library: declare it as a dependency of your own tool instead of installing it with `pipx`.
When your users run `pipx install your-tool` or `uv tool install your-tool`, it comes along.

:::note[Pre-release]
If your package manager can't find `sponsorkit`, it hasn't reached PyPI yet. Install it from the Git
repository instead; [Build from source](/docs/install/from-source#python) has the pip, uv and Poetry commands.
:::

Check the install without signing in or touching the network:

```bash title="Terminal"
SPONSORKIT_MOCK=active-monthly python -c "import sponsorkit as s; print(s.__version__, len(s.Sponsorkit(github='octocat').get_financial_contribution().active()))"
# 0.1.0 1
```

## A first look

```python title="my_cli.py"
from sponsorkit import Sponsorkit

sk = Sponsorkit(github="octocat", opencollective="my-collective", app_name="my-cli")

fc = sk.get_financial_contribution()  # cached for an hour; never raises because of the network
if fc.active():
    print("Thank you for supporting my-cli!")
elif fc.signed_in:
    print(f"Enjoying my-cli? Support it: {sk.checkout_url(frequency='monthly')}")
```

Replace `octocat` and `my-collective` with the accounts you receive contributions on; one of the two is
enough. The [quickstart](quickstart.md) turns this into a complete tool with `login`, `logout` and `sponsor`
commands.

## What you can import

Everything is importable from the top-level package:

| Name | What it is |
|---|---|
| `Sponsorkit` | The client: reads contributions, signs in, opens checkout, creates nags. |
| `ContributionResult`, `Contribution`, `CheckoutResult`, `Money`, `Supporter`, … | Frozen dataclasses for results. |
| `SponsorkitError`, `ErrorCode` | The one exception type and its codes. |
| `verify_session`, `averify_session` | Backend verification (also in `sponsorkit.server`). |
| `Storage`, `FileStorage`, `MemoryStorage` | Where the client keeps its state. |
| `MockPreset`, `MockData`, `reset_process_state` | Testing helpers. |

## In this section

| Page | What it covers |
|---|---|
| [Quickstart](quickstart.md) | A complete CLI, and the same flow with asyncio. |
| [Configuration](configuration.md) | Every constructor option with its default, and the environment variables. |
| [Sign-in](sign-in.md) | Loopback and paste-back sign-in, adding identities, timeouts and cancellation. |
| [Contributions](contributions.md) | `get_financial_contribution()`, the result, its helpers and caching. |
| [Checkout](checkout.md) | `open_checkout()` and `checkout_url()`. |
| [Nag](nag.md) | Asking for support every N runs or N days. |
| [Testing](testing.md) | Mock mode, in-memory storage, a fake clock and a fake API with `httpx.MockTransport`. |
| [Backend verification](backend-verification.md) | Checking a supporter on your server with `verify_session()`. |
| [Errors and cancellation](errors.md) | `SponsorkitError`, its codes, `retry_after`, and cancelling with events. |
| [Platform notes](platform-notes.md) | Async variants, threads, operating systems, storage locations, logging. |

The [API reference](/docs/reference/python) lists every class, method, field and type alias, generated from the
package's source and docstrings.
