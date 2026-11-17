"""The Sponsorkit client (SPEC §7.1)."""

from __future__ import annotations

import asyncio
import math
import os
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal, TypeVar, cast

import httpx

from ._http import (
    DEFAULT_API_BASE_URL,
    DEFAULT_HTTP_TIMEOUT,
    USER_AGENT,
    build_url,
    is_session_token,
    iso,
    normalize_base_url,
    parse_iso,
    problem_code,
    resolve_request_timeout,
    retry_after_seconds,
    unexpected_response,
)
from ._loopback import LoopbackReceiver
from ._state import PROCESS, CacheEntry, StateStore, StoredState, _DevCheck, log
from .errors import SponsorkitError
from .mock import MockData, MockPreset, mock_checkout_contribution, mock_result, parse_mock_option
from .models import FREQUENCIES, CheckoutResult, Contribution, ContributionResult, Frequency
from .nag import Nag, Predicate, parse_duration
from .pkce import code_challenge, generate_code_verifier
from .storage import FileStorage, MemoryStorage, Storage, default_storage_dir
from .targets import PROVIDERS, Provider, Target, targets_from_options, targets_hash, targets_param

__all__ = ["CancelEvent", "SignInMethod", "Sponsorkit"]

_T = TypeVar("_T")

SignInMethod = Literal["auto", "loopback", "paste"]
"""How native sign-in delivers the code.

``auto`` (loopback, falling back to paste-back), ``loopback`` or ``paste``.
"""

CancelEvent = threading.Event
"""The cancellation primitive for sync calls: set the event to cancel."""

SIGN_IN_TIMEOUT = 300.0
"""Default ``sign_in_timeout``: sign-in gives up after 5 minutes (PROTOCOL §7)."""


_HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}
"""Sent on every API request, including through a caller-supplied ``http_client``."""


def _seconds(value: object, name: str, *, allow_zero: bool = False) -> float:
    """Validate a duration: a finite ``int``/``float`` ``> 0`` (``>= 0`` with ``allow_zero``)."""
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or value < 0
        or (value == 0 and not allow_zero)
    ):
        kind = "non-negative" if allow_zero else "positive"
        raise SponsorkitError("invalid_config", f"{name} must be a finite {kind} number of seconds")
    return float(value)


def _flag(value: str | None) -> bool:
    """Return whether a variable is *set*: non-empty and not ``0``/``false`` (case-insensitive)."""
    return value is not None and value.strip() != "" and value.strip().lower() not in ("0", "false")


def _is_tty() -> bool:
    try:
        return bool(sys.stdout and sys.stdout.isatty() and sys.stderr and sys.stderr.isatty())
    except (AttributeError, ValueError, OSError):
        return False


def _has_display() -> bool:
    if sys.platform in ("win32", "darwin", "cygwin"):
        return True
    return bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))


BROWSER_LAUNCH_GRACE = 1.5
"""A system launcher still running after this many seconds counts as having opened the browser."""


def _launch(argv: list[str], grace: float = BROWSER_LAUNCH_GRACE) -> bool:
    """Run a browser launcher (no shell). Exit 0, or still running after ``grace`` s, counts as opened."""
    try:
        proc = subprocess.Popen(
            argv,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=os.name == "posix",
        )
    except (OSError, ValueError):
        return False
    try:
        return proc.wait(timeout=grace) == 0
    except subprocess.TimeoutExpired:
        return True  # still running: assume the browser is opening (PROTOCOL §7.0)


def _launcher_argv(url: str) -> list[str] | None:
    """The system launcher for ``url``; the URL is a single argv entry, never parsed by a shell."""
    if sys.platform == "darwin":
        return ["open", url]
    if sys.platform == "win32":
        return ["rundll32", "url.dll,FileProtocolHandler", url]
    opener = shutil.which("xdg-open")
    return [opener, url] if opener else None


def _default_open_browser(url: str) -> bool:
    if not url.startswith(("https://", "http://")):
        return False
    argv = None if os.environ.get("BROWSER") else _launcher_argv(url)
    if argv is not None:
        return _launch(argv)
    try:  # $BROWSER set, or no system launcher found: let the webbrowser module try
        return webbrowser.open(url)
    except webbrowser.Error:
        return False


def _dev_mode() -> bool:
    """Python's implicit development signal (PROTOCOL §7, ``devChecks`` default)."""
    return bool(sys.flags.dev_mode)


def _default_prompt_for_code(url: str) -> str:
    sys.stderr.write("Paste the sign-in code shown in the browser: ")
    sys.stderr.flush()
    line = sys.stdin.readline() if sys.stdin else ""
    if not line:
        raise SponsorkitError("cancelled", "No sign-in code was entered")
    return line


@dataclass
class _MockState:
    signed_in: bool
    contributions: list[Contribution]


@dataclass(frozen=True)
class _CheckoutOptions:
    provider: Provider | None
    amount: int | None
    currency: str | None
    frequency: Frequency | None

    def params(self) -> dict[str, str]:
        out: dict[str, str] = {}
        if self.provider:
            out["provider"] = self.provider
        if self.amount is not None:
            out["amount"] = str(self.amount)
        if self.currency:
            out["currency"] = self.currency
        if self.frequency:
            out["frequency"] = self.frequency
        return out


class Sponsorkit:
    """Reports what the current user contributed to your accounts, and sends them to contribute.

    Example::

        from sponsorkit import Sponsorkit

        sk = Sponsorkit(github="octocat", opencollective="my-project", app_name="my-cli")
        fc = sk.get_financial_contribution()
        if fc.signed_in and not fc.active():
            print(f"Enjoying my-cli? Support it: {sk.checkout_url(frequency='monthly')}")

    Every blocking method has an ``a``-prefixed async variant (``aget_financial_contribution``,
    ``asign_in``, ``aopen_checkout``, ``asign_out``, ``ais_signed_in``) that runs it in a worker thread.

    Args:
        github: GitHub Sponsors login to check (user or organization).
        opencollective: Open Collective collective slug to check. At least one target is required.
        app_name: Shown on the consent page as "says it is" (up to 64 characters).
        cache_ttl: Seconds a result is served from the local cache without calling the API (minimum 60).
        mock: A mock preset name (``signed-out``, ``none``, ``active-monthly``, ``one-time``,
            ``cancelled``, ``org``) or ``{"contributions": [...]}``. No network or disk access.
            Overrides ``SPONSORKIT_MOCK``.
        storage: A custom :class:`~sponsorkit.storage.Storage` backend.
        storage_dir: Directory for the storage files (default: the per-user config directory).
        api_base_url: Sponsorkit origin, for self-hosting and tests.
        open_browser: ``open_browser(url)`` replaces the system browser. Returning ``False`` or raising
            means the browser could not be opened.
        prompt_for_code: ``prompt_for_code(url)`` returns the code the user pasted (paste-back sign-in).
            Default: read a line from stdin.
        sign_in_method: ``auto`` (default), ``loopback`` or ``paste``.
        sign_in_timeout: Seconds to wait for a loopback or paste-back sign-in before raising
            ``timeout`` (default 300).
        interactive: Overrides the stdout/stderr TTY check used by the nag helper (default: TTY
            detection).
        env: Where ``SPONSORKIT_DISABLE``, ``SPONSORKIT_MOCK``, ``SPONSORKIT_NO_NAG``,
            ``SPONSORKIT_DEV_CHECKS`` and ``CI`` are read (default: ``os.environ``). A mapping given
            here *replaces* the process environment for these variables; it is not merged.
        dev_checks: Force the dev-time target existence check on or off. Default: on when
            ``SPONSORKIT_DEV_CHECKS`` is set or in Python development mode (``python -X dev``).
        checkout_poll_interval: Seconds between checks while waiting for a checkout (default 60).
        clock: Returns the current time; injectable for tests.
        request_timeout: Timeout in seconds for every HTTP request (default 30; ``0`` disables it).
            Applies to a custom ``http_client`` too. A timeout counts as a network error.
        http_client: An :class:`httpx.Client` to use for API calls (proxies, custom transports).
        timeout: Deprecated alias of ``request_timeout``.

    Raises:
        SponsorkitError: ``invalid_config`` for missing or malformed targets and invalid options.
    """

    def __init__(
        self,
        github: str | None = None,
        opencollective: str | None = None,
        *,
        app_name: str | None = None,
        cache_ttl: float = 3600,
        mock: MockPreset | MockData | Mapping[str, Any] | None = None,
        storage: Storage | None = None,
        storage_dir: str | os.PathLike[str] | None = None,
        api_base_url: str = DEFAULT_API_BASE_URL,
        open_browser: Callable[[str], object] | None = None,
        prompt_for_code: Callable[[str], str] | None = None,
        sign_in_method: SignInMethod = "auto",
        sign_in_timeout: float = SIGN_IN_TIMEOUT,
        interactive: bool | None = None,
        env: Mapping[str, str] | None = None,
        dev_checks: bool | None = None,
        checkout_poll_interval: float = 60.0,
        clock: Callable[[], datetime] | None = None,
        request_timeout: float = DEFAULT_HTTP_TIMEOUT,
        http_client: httpx.Client | None = None,
        timeout: float | None = None,
    ) -> None:
        self._targets: tuple[Target, ...] = targets_from_options(github, opencollective)
        self._param = targets_param(self._targets)
        self._hash = targets_hash(self._targets)
        self._env: Mapping[str, str] = os.environ if env is None else env
        self._api = normalize_base_url(api_base_url)
        if app_name is not None and (not isinstance(app_name, str) or len(app_name) > 64):
            raise SponsorkitError("invalid_config", "app_name must be a string of at most 64 characters")
        self._app_name = app_name or None
        if sign_in_method not in ("auto", "loopback", "paste"):
            raise SponsorkitError("invalid_config", f"Unknown sign_in_method {sign_in_method!r}")
        self._sign_in_method: SignInMethod = sign_in_method
        self._cache_ttl = max(60.0, _seconds(cache_ttl, "cache_ttl", allow_zero=True))
        self._sign_in_timeout = _seconds(sign_in_timeout, "sign_in_timeout")
        if interactive is not None and not isinstance(interactive, bool):
            raise SponsorkitError("invalid_config", "interactive must be a boolean or None")
        self._interactive = interactive
        self._poll_interval = _seconds(checkout_poll_interval, "checkout_poll_interval")
        if storage_dir is not None and not isinstance(storage_dir, (str, os.PathLike)):
            raise SponsorkitError("invalid_config", "storage_dir must be a str or os.PathLike path")
        self._open_browser_hook = open_browser
        self._prompt = prompt_for_code or _default_prompt_for_code
        self._clock = clock
        self._timeout = resolve_request_timeout(
            request_timeout if timeout is None else timeout,
            "request_timeout" if timeout is None else "timeout",
        )
        self._http_client = http_client
        self._own_client: httpx.Client | None = None
        self._client_lock = threading.Lock()

        self._disabled = _flag(self._env.get("SPONSORKIT_DISABLE"))
        mock_value: object = mock if mock is not None else (self._env.get("SPONSORKIT_MOCK") or None)
        self._mock: MockPreset | MockData | None = (
            parse_mock_option(mock_value) if mock_value is not None else None
        )
        self._mock_state: _MockState | None = None
        if self._mock is not None and not self._disabled:
            r = mock_result(self._targets, self._mock)
            self._mock_state = _MockState(r.signed_in, list(r.contributions))
        self._dev_checks = (
            (_flag(self._env.get("SPONSORKIT_DEV_CHECKS")) or _dev_mode())
            if dev_checks is None
            else bool(dev_checks)
        )

        backend: Storage
        if self._mock_state is not None or self._disabled:
            backend = MemoryStorage()  # mock and disabled modes never touch the disk
        elif storage is not None:
            backend = storage
        elif storage_dir is not None:
            backend = FileStorage(Path(storage_dir))
        else:
            directory = default_storage_dir()
            if directory is None:
                # PROTOCOL §7.0: no per-user config directory (e.g. HOME unset). Never use the cwd.
                log.warning("sponsorkit: no per-user config directory; keeping state in memory")
                backend = MemoryStorage()
            else:
                backend = FileStorage(directory)
        self._store = StateStore(backend, self._hash)

    # ------------------------------------------------------------------ basics

    def __repr__(self) -> str:
        return f"Sponsorkit(targets={self._param!r})"

    def __enter__(self) -> Sponsorkit:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        """Close the HTTP connection pool this instance created (if any)."""
        with self._client_lock:
            if self._own_client is not None:
                self._own_client.close()
                self._own_client = None

    @property
    def targets(self) -> tuple[str, ...]:
        """The canonical target strings, e.g. ``("github:octocat",)``."""
        return tuple(str(t) for t in self._targets)

    @property
    def targets_param(self) -> str:
        """The canonical target param used in URLs."""
        return self._param

    @property
    def targets_hash(self) -> str:
        """The ``targets_hash`` that keys local storage."""
        return self._hash

    @property
    def disabled(self) -> bool:
        """Whether ``SPONSORKIT_DISABLE`` is set."""
        return self._disabled

    @property
    def mock(self) -> bool:
        """Whether mock mode is on (and not overridden by ``SPONSORKIT_DISABLE``)."""
        return self._mock_state is not None

    def _now(self) -> datetime:
        now = self._clock() if self._clock else datetime.now(timezone.utc)
        return now if now.tzinfo else now.replace(tzinfo=timezone.utc)

    def _client(self) -> httpx.Client:
        if self._http_client is not None:
            return self._http_client
        with self._client_lock:
            if self._own_client is None:
                self._own_client = httpx.Client(timeout=self._timeout, headers=_HEADERS)
            return self._own_client

    def _empty(self, **over: Any) -> ContributionResult:
        base: dict[str, Any] = {
            "signed_in": False,
            "disabled": False,
            "mock": False,
            "targets": self.targets,
            "supporter": None,
            "contributions": (),
            "fetched_at": None,
            "stale": False,
            "from_cache": False,
        }
        base.update(over)
        return ContributionResult(**base)

    def _mock_now(self) -> ContributionResult:
        assert self._mock_state is not None
        if not self._mock_state.signed_in:
            return mock_result(self._targets, "signed-out")
        return mock_result(self._targets, MockData(tuple(self._mock_state.contributions)))

    def _safe_update(self, fn: Callable[[StoredState], bool | None]) -> None:
        try:
            self._store.update(fn)
        except Exception as e:  # OSError, or whatever a custom Storage raises
            log.warning("sponsorkit: could not write local storage: %s", e)

    def _read(self) -> StoredState:
        try:
            return self._store.read()
        except Exception as e:  # PROTOCOL §7.0: reading storage never throws
            log.warning("sponsorkit: could not read local storage: %s", e)
            return StoredState()

    # ------------------------------------------------------------------ dev check

    def _dev_check(self) -> None:
        """Once per process: throw ``invalid_config`` if a target does not exist (dev builds only)."""
        if not self._dev_checks or self._disabled or self._mock_state is not None:
            return
        key = (self._api, self._param)
        with PROCESS.lock:
            check = PROCESS.dev_checks.get(key)
            if check is None:
                check = PROCESS.dev_checks[key] = _DevCheck()
        with check.lock:
            if not check.done:
                try:
                    self._run_dev_check()
                except SponsorkitError as e:
                    check.error = e
                check.done = True
        if check.error is not None:
            raise SponsorkitError("invalid_config", str(check.error))

    def _run_dev_check(self) -> None:
        params: dict[str, str] = {t.provider: t.account for t in self._targets}
        try:
            res = self._client().get(
                build_url(self._api, "/api/v1/targets", params), headers=_HEADERS, timeout=self._timeout
            )
            if res.status_code != 200:
                return
            body = res.json()
            missing = [
                str(t.get("target"))
                for t in body.get("targets", [])
                if isinstance(t, dict) and t.get("exists") is False
            ]
        except (httpx.HTTPError, ValueError, AttributeError, TypeError, RecursionError):
            return  # offline or odd response: the check fails open
        if missing:
            raise SponsorkitError(
                "invalid_config",
                f"Sponsorkit target(s) {', '.join(missing)} do not exist or have no sponsorship listing",
            )

    # ------------------------------------------------------------------ status

    def is_signed_in(self) -> bool:
        """Whether a session token is stored for this target set. No network access."""
        if self._disabled:
            return False
        if self._mock_state is not None:
            return self._mock_state.signed_in
        return self._read().session_token is not None

    def get_financial_contribution(self, *, cache_ttl: float | None = None) -> ContributionResult:
        """What the current user has contributed to the targets.

        Served from the local cache when it is younger than ``cache_ttl`` seconds (default: the
        instance's ``cache_ttl``; ``0`` always refreshes). Never raises for network or server
        problems: the cached result is returned with ``stale=True`` instead, or a signed-in empty
        result when nothing is cached. An invalid session signs the user out.

        Raises:
            SponsorkitError: only ``invalid_config`` from the dev-time target check.
        """
        if self._disabled:
            return self._empty(disabled=True)
        if self._mock_state is not None:
            return self._mock_now()
        self._dev_check()
        stored = self._read()
        token = stored.session_token
        if token is None:
            return self._empty()
        ttl = self._cache_ttl if cache_ttl is None else max(0.0, float(cache_ttl))
        cache = stored.cache
        now = self._now()
        if cache is not None and ttl > 0:
            cached_at = parse_iso(cache.stored_at)
            if cached_at is not None and (now - cached_at).total_seconds() < ttl:
                return replace(cache.result, from_cache=True)

        def fallback() -> ContributionResult:
            if cache is not None:
                return replace(cache.result, from_cache=True, stale=True)
            return self._empty(signed_in=True, stale=True)

        memo_key = (self._api, self._param)
        with PROCESS.lock:
            retry_until = PROCESS.retry_until.get(memo_key)
        if retry_until is not None and retry_until > now:
            return fallback()

        try:
            res = self._client().get(
                f"{self._api}/api/v1/contributions",
                headers={**_HEADERS, "Authorization": f"Bearer {token}"},
                timeout=self._timeout,
            )
        except httpx.HTTPError as e:
            log.info("sponsorkit: API unreachable, serving cache: %s", e)
            return fallback()

        if res.status_code == 401:
            # Only clear the token this request used: a concurrent sign-in may have replaced it.
            self._clear_session(only_if=token)
            return self._empty()
        if res.status_code == 429:
            delay = retry_after_seconds(res.headers.get("retry-after"), now)
            with PROCESS.lock:
                PROCESS.retry_until[memo_key] = now + timedelta(seconds=delay)
            return fallback()
        if res.status_code != 200:
            return fallback()
        try:
            result = ContributionResult.from_dict(res.json())
        except (KeyError, TypeError, ValueError, AttributeError, RecursionError):
            return fallback()
        result = replace(result, from_cache=False)
        unavailable = result.unavailable or ()
        if unavailable:
            result = replace(result, stale=True)
            if cache is not None:
                have = {c.id for c in result.contributions}
                kept = tuple(
                    c for c in cache.result.contributions if c.provider in unavailable and c.id not in have
                )
                result = replace(result, contributions=result.contributions + kept)
        header = res.headers.get("sponsorkit-session")
        renewed = header if is_session_token(header) else None
        stored_at = iso(self._now())

        def save(s: StoredState) -> bool:
            # PROTOCOL §7.0: write back only while the stored token is still the one this request
            # used. Another thread, instance or process may have signed out, signed in again or
            # renewed it meanwhile; then this result belongs to a session that is gone here.
            if s.session_token != token:
                return False
            if renewed is not None:
                s.session_token = renewed
            s.cache = CacheEntry(result, stored_at)
            return True

        self._safe_update(save)
        return result

    def _clear_session(self, only_if: str | None = None, *, strict: bool = False) -> None:
        """Remove the token and cache; with ``only_if``, only while that token is still stored.

        With ``strict`` (``sign_out``), a storage failure raises ``invalid_config``; otherwise it is
        logged.
        """
        try:
            with self._store.lock:
                if not self._store.exists():
                    return
                state = self._store.read()
                if only_if is not None and state.session_token != only_if:
                    return
                state.session_token = None
                state.cache = None
                if state.empty:
                    self._store.storage.delete(self._store.key)
                else:
                    self._store.storage.write(self._store.key, state.dump())
        except Exception as e:
            if strict:
                raise SponsorkitError(
                    "invalid_config", f"Could not clear the stored session (check storage_dir): {e}"
                ) from e
            if not isinstance(e, OSError):
                raise
            log.warning("sponsorkit: could not update local storage: %s", e)

    # ------------------------------------------------------------------ sign-in

    def _resolve_method(self, method: SignInMethod | None) -> SignInMethod:
        m = method or self._sign_in_method
        if m not in ("auto", "loopback", "paste"):
            raise SponsorkitError("invalid_config", f"Unknown sign-in method {m!r}")
        if m != "auto" or self._open_browser_hook is not None:
            return m
        if os.environ.get("SSH_CONNECTION") or os.environ.get("SSH_TTY") or not _has_display():
            return "paste"
        return "auto"

    def _open(self, url: str) -> bool:
        opener = self._open_browser_hook or _default_open_browser
        try:
            return opener(url) is not False
        except Exception as e:
            log.warning("sponsorkit: could not open the browser: %s", e)
            return False

    def _with_app(self, params: dict[str, str]) -> dict[str, str]:
        if self._app_name:
            params["app_name"] = self._app_name
        return params

    def _acquire_code(
        self,
        path: str,
        params: dict[str, str],
        method: SignInMethod | None,
        deadline: float,
        cancel: threading.Event | None,
        continue_url: str | None = None,
        *,
        limit: str,
    ) -> str:
        """Run the browser part of sign-in and return the code.

        Raises ``timeout`` once ``deadline`` (monotonic) passes and ``cancelled`` when ``cancel`` is set.
        ``limit`` describes the time limit in the ``timeout`` message.
        """
        resolved = self._resolve_method(method)
        if resolved in ("auto", "loopback"):
            code = self._loopback_code(
                path, params, resolved == "auto", deadline, cancel, continue_url, limit
            )
            if code is not None:
                return code
        url = build_url(self._api, path, self._with_app({**params, "delivery": "paste"}))
        print(
            f"To sign in to Sponsorkit, open this URL in a browser on any device:\n\n  {url}\n",
            file=sys.stderr,
        )
        code = self._prompt_until(url, deadline, cancel, limit).strip()
        if not code:
            raise SponsorkitError("cancelled", "No sign-in code was entered")
        return code

    def _loopback_code(
        self,
        path: str,
        params: dict[str, str],
        allow_fallback: bool,
        deadline: float,
        cancel: threading.Event | None,
        continue_url: str | None,
        limit: str,
    ) -> str | None:
        """Loopback sign-in; ``None`` means "fall back to paste-back" (``auto`` only).

        PROTOCOL §7.0: a receiver that cannot bind falls back (``auto``); the callback is accepted
        while ``open_browser`` is still running; an opener that fails falls back (``auto``).
        """
        try:
            receiver = LoopbackReceiver(continue_url)
        except OSError as e:
            if allow_fallback:
                log.info("sponsorkit: loopback receiver could not bind, using paste-back: %s", e)
                return None
            raise SponsorkitError(
                "provider_error", f"Could not start the loopback sign-in receiver on 127.0.0.1: {e}"
            ) from e
        try:
            q = self._with_app({**params, "delivery": "loopback", "redirect_uri": receiver.redirect_uri})
            url = build_url(self._api, path, q)
            opened = threading.Event()
            box: dict[str, bool] = {}

            def run_opener() -> None:
                try:
                    box["ok"] = self._open(url)
                finally:
                    opened.set()

            threading.Thread(target=run_opener, name="sponsorkit-open-browser", daemon=True).start()
            opener_pending = True
            while True:
                outcome = receiver.outcome
                if outcome is None and opener_pending and opened.is_set():
                    opener_pending = False
                    if not box.get("ok", False):
                        if allow_fallback:
                            return None
                        print(f"Open this URL in a browser to continue:\n\n  {url}\n", file=sys.stderr)
                if outcome is None:
                    if cancel is not None and cancel.is_set():
                        raise self._abandoned(True, limit)
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise self._abandoned(False, limit)
                    receiver.wait(time.monotonic() + min(remaining, 0.05), None)
                    continue
                if outcome.kind == "code":
                    return outcome.value
                code = outcome.value
                if code not in ("access_denied", "invalid_state", "provider_error"):
                    code = "provider_error"
                raise SponsorkitError(cast(Any, code), f"Sign-in failed: {outcome.value}")
        finally:
            receiver.close()

    def _abandoned(self, cancelled: bool, limit: str) -> SponsorkitError:
        if cancelled:
            return SponsorkitError("cancelled", "Sign-in was cancelled")
        return SponsorkitError("timeout", f"Sign-in did not complete within {limit}")

    def _prompt_until(self, url: str, deadline: float, cancel: threading.Event | None, limit: str) -> str:
        """Call ``prompt_for_code`` in a helper thread so ``deadline`` and ``cancel`` still apply.

        On timeout or cancellation the prompt thread is abandoned (it is a daemon thread).
        """
        if cancel is not None and cancel.is_set():
            raise self._abandoned(True, limit)
        done = threading.Event()
        box: dict[str, Any] = {}

        def run() -> None:
            try:
                box["code"] = self._prompt(url)
            except BaseException as e:
                box["error"] = e
            finally:
                done.set()

        threading.Thread(target=run, name="sponsorkit-prompt", daemon=True).start()
        while not done.is_set():
            if cancel is not None and cancel.is_set():
                raise self._abandoned(True, limit)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise self._abandoned(False, limit)
            done.wait(min(remaining, 0.05))
        if "error" in box:
            raise box["error"]
        return str(box.get("code") or "")

    def _exchange(self, code: str, verifier: str) -> ContributionResult:
        stored = self._read()
        body: dict[str, str] = {"code": code, "codeVerifier": verifier}
        if stored.session_token:
            body["sessionToken"] = stored.session_token
        while True:
            try:
                res = self._client().post(
                    f"{self._api}/api/v1/auth/token", json=body, headers=_HEADERS, timeout=self._timeout
                )
            except httpx.HTTPError as e:
                raise SponsorkitError("network_error", f"Could not reach the Sponsorkit API: {e}") from e
            request_id = res.headers.get("sponsorkit-request-id")
            try:
                data: Any = res.json()
            except (ValueError, RecursionError):
                data = None
            if res.status_code == 401 and "sessionToken" in body:
                # PROTOCOL §7: the stored session is dead. Clear it and retry the same code once
                # without sessionToken, which starts a fresh session with this identity.
                self._clear_session(only_if=body["sessionToken"])
                del body["sessionToken"]
                continue
            if res.status_code == 400 and problem_code(data) == "invalid_code":
                raise SponsorkitError(
                    "invalid_code", "The sign-in code was rejected (invalid_code)", request_id=request_id
                )
            if res.status_code != 200:
                raise unexpected_response(res, "Sign-in failed", data)
            try:
                session_token = data["sessionToken"]
                if not is_session_token(session_token):
                    raise TypeError("sessionToken")
                result = replace(ContributionResult.from_dict(data["result"]), from_cache=False)
            except (KeyError, TypeError, ValueError, AttributeError) as e:
                raise SponsorkitError(
                    "network_error", f"Malformed token response: {e}", request_id=request_id
                ) from e
            self._save_session(session_token, result)
            return result

    def _save_session(self, session_token: str, result: ContributionResult) -> None:
        """Store the new token and cache the token response's result (PROTOCOL §7.1 rule 1)."""
        entry = CacheEntry(result, iso(self._now()))

        def save(s: StoredState) -> None:
            s.session_token = session_token
            s.cache = entry

        try:
            self._store.update(save)
        except Exception as e:  # OSError, or whatever a custom Storage raises
            raise SponsorkitError(
                "invalid_config", f"Could not store the session (check storage_dir): {e}"
            ) from e

    def _check_provider(self, provider: str | None) -> Provider | None:
        if provider is None:
            return None
        if provider not in PROVIDERS or provider not in {t.provider for t in self._targets}:
            raise SponsorkitError(
                "invalid_config", f"Provider {provider!r} is not one of the configured targets"
            )
        return provider

    def sign_in(
        self,
        provider: Provider | None = None,
        *,
        method: SignInMethod | None = None,
        timeout: float | None = None,
        cancel: threading.Event | None = None,
    ) -> ContributionResult:
        """Sign the user in (or add another provider identity when already signed in).

        Opens the consent page in the browser (loopback) or prints a URL and asks for the code
        (paste-back). ``provider`` skips the provider picker; signing in with a second provider adds
        that identity to the existing session. Returns the fresh result, which is also cached.

        ``timeout`` overrides the instance's ``sign_in_timeout`` (seconds, finite and positive) for this
        call. Setting ``cancel`` abandons the sign-in.

        Raises:
            SponsorkitError: ``disabled``, ``invalid_config``, ``access_denied``, ``invalid_state``,
                ``provider_error``, ``invalid_code``, ``network_error`` (with ``retry_after`` when the
                API sent ``Retry-After``), ``timeout`` or ``cancelled``.
        """
        if self._disabled:
            raise SponsorkitError("disabled", "Sponsorkit is disabled (SPONSORKIT_DISABLE)")
        prov = self._check_provider(provider)
        if timeout is None:
            limit, label = self._sign_in_timeout, "sign_in_timeout"
        else:
            limit, label = _seconds(timeout, "timeout"), "timeout"
        if self._mock_state is not None:
            if not self._mock_state.signed_in:
                self._mock_state = _MockState(True, [])
            return self._mock_now()
        self._dev_check()
        verifier = generate_code_verifier()
        params: dict[str, str] = {"targets": self._param, "challenge": code_challenge(verifier)}
        if prov:
            params["provider"] = prov
        if self.is_signed_in():
            params["add"] = "1"
        code = self._acquire_code(
            "/connect", params, method, time.monotonic() + limit, cancel, limit=f"{limit:g} s ({label})"
        )
        return self._exchange(code, verifier)

    # ------------------------------------------------------------------ checkout

    def _checkout_options(
        self, provider: object, amount: object, currency: object, frequency: object
    ) -> _CheckoutOptions:
        """Validate checkout options (PROTOCOL §7.1 item 16); ``invalid_config`` for anything invalid."""
        if provider is not None and not isinstance(provider, str):
            raise SponsorkitError("invalid_config", "provider must be a string")
        prov = self._check_provider(provider)
        if amount is not None and (isinstance(amount, bool) or not isinstance(amount, int) or amount <= 0):
            raise SponsorkitError("invalid_config", "amount must be a positive integer in minor units")
        if currency is not None and (
            not isinstance(currency, str)
            or len(currency) != 3
            or not currency.isascii()
            or not currency.isalpha()
            or not currency.isupper()
        ):
            raise SponsorkitError("invalid_config", "currency must be an uppercase ISO 4217 code, e.g. USD")
        if frequency is not None and frequency not in FREQUENCIES:
            raise SponsorkitError("invalid_config", f"frequency must be one of {', '.join(FREQUENCIES)}")
        return _CheckoutOptions(prov, amount, currency, cast("Frequency | None", frequency))

    def checkout_url(
        self,
        *,
        provider: Provider | None = None,
        amount: int | None = None,
        currency: str | None = None,
        frequency: Frequency | None = None,
    ) -> str:
        """A link to the checkout page that needs no sign-in. Offline and synchronous.

        Suitable for nags, READMEs and ``--help`` output. ``amount`` is in minor units (cents).
        Touches neither the network nor the disk.

        Raises:
            SponsorkitError: ``invalid_config`` for a provider that is not configured, a frequency
                other than ``one_time``/``monthly``/``yearly``, an amount that is not a positive
                integer, or a currency that is not three uppercase letters.
        """
        opts = self._checkout_options(provider, amount, currency, frequency)
        return build_url(self._api, "/checkout", {"targets": self._param, **opts.params()})

    def open_checkout(
        self,
        *,
        provider: Provider | None = None,
        amount: int | None = None,
        currency: str | None = None,
        frequency: Frequency | None = None,
        timeout: float = 600,
        cancel: threading.Event | None = None,
        method: SignInMethod | None = None,
        poll_interval: float | None = None,
    ) -> CheckoutResult:
        """Send the user to contribute, then wait for the new contribution to show up.

        Signs in first if needed (so the contribution can be detected; this phase is bounded by
        ``sign_in_timeout``), opens the checkout page, then re-checks every ``poll_interval`` seconds
        (default: ``checkout_poll_interval``) until a new or changed contribution appears. ``timeout``
        (seconds, default 10 minutes) covers only that polling phase. Resolves
        ``CheckoutResult("unknown")`` when polling times out or when ``cancel`` is set during either
        phase; it does not raise for those.

        Raises:
            SponsorkitError: ``disabled``, ``invalid_config`` (also for a ``timeout`` or
                ``poll_interval`` that is not a finite positive number) or a sign-in error (including
                ``timeout`` when the sign-in phase exceeds ``sign_in_timeout``).
        """
        if self._disabled:
            raise SponsorkitError("disabled", "Sponsorkit is disabled (SPONSORKIT_DISABLE)")
        opts = self._checkout_options(provider, amount, currency, frequency)
        interval = self._poll_interval if poll_interval is None else _seconds(poll_interval, "poll_interval")
        timeout = _seconds(timeout, "timeout")
        if self._mock_state is not None:
            c = mock_checkout_contribution(
                self._targets,
                provider=opts.provider,
                amount=opts.amount,
                currency=opts.currency,
                frequency=opts.frequency,
            )
            kept = (
                [x for x in self._mock_state.contributions if x.id != c.id]
                if self._mock_state.signed_in
                else []
            )
            self._mock_state = _MockState(True, [*kept, c])
            return CheckoutResult("contributed", c)
        self._dev_check()
        query = {"targets": self._param, **opts.params()}
        baseline: ContributionResult
        if self.is_signed_in():
            cached = self._read().cache
            baseline = cached.result if cached is not None else self.get_financial_contribution(cache_ttl=0)
            url = build_url(self._api, "/checkout", query)
            if not self._open(url):
                print(f"Open this URL in a browser to contribute:\n\n  {url}\n", file=sys.stderr)
        else:
            verifier = generate_code_verifier()
            # PROTOCOL §7.1 item 17: the redirect carries exactly the checkout params + step=choose.
            continue_url = build_url(self._api, "/checkout", {**query, "step": "choose"})
            try:
                code = self._acquire_code(
                    "/checkout",
                    {**query, "challenge": code_challenge(verifier)},
                    method,
                    time.monotonic() + self._sign_in_timeout,
                    cancel,
                    continue_url,
                    limit=f"{self._sign_in_timeout:g} s (sign_in_timeout)",
                )
            except SponsorkitError as e:
                if e.code == "cancelled" and cancel is not None and cancel.is_set():
                    return CheckoutResult("unknown")
                raise
            baseline = self._exchange(code, verifier)

        deadline = time.monotonic() + timeout
        before = {c.id: c.to_dict() for c in baseline.contributions}
        waiter = cancel or threading.Event()
        while not waiter.is_set() and time.monotonic() < deadline:
            result = self.get_financial_contribution(cache_ttl=0)
            for c in result.contributions:
                if before.get(c.id) != c.to_dict():
                    return CheckoutResult("contributed", c)
            wait = min(interval, deadline - time.monotonic())
            if wait <= 0 or waiter.wait(wait):
                break
        return CheckoutResult("unknown")

    # ------------------------------------------------------------------ sign-out

    def sign_out(self) -> None:
        """Delete the stored session token and cached result. Nag state is kept. No network access.

        Raises:
            SponsorkitError: ``invalid_config`` when the stored session cannot be cleared (for
                example the storage directory is read-only).
        """
        if self._disabled:
            return
        if self._mock_state is not None:
            self._mock_state = _MockState(False, [])
            return
        self._clear_session(strict=True)

    # ------------------------------------------------------------------ nag

    def nag(self, id: str, *, every: int = 10, or_every: str | timedelta | None = None) -> Nag:
        """Create a nag helper (SPEC §7.5).

        Args:
            id: Names the counter; several nags can coexist.
            every: Due once this many runs (processes) have counted since it was last shown.
            or_every: Also due once this much time passed since it was last shown (ISO-8601
                duration such as ``"P7D"``, or a :class:`~datetime.timedelta`).

        Example::

            nag = sk.nag("my-cli", every=10, or_every="P7D")
            if nag.due(lambda fc: not fc.active()):
                print(f"Enjoying my-cli? {sk.checkout_url(frequency='monthly')}", file=sys.stderr)
                nag.shown()
        """
        if not isinstance(id, str) or not id:
            raise SponsorkitError("invalid_config", "nag id must be a non-empty string")
        if isinstance(every, bool) or not isinstance(every, int) or every < 1:
            raise SponsorkitError("invalid_config", "every must be a positive integer")
        return Nag(self, id, every, parse_duration(or_every) if or_every is not None else None)

    def _nag_due(self, nag: Nag, predicate: Predicate | None, force: bool) -> bool:
        if self._disabled:
            return False
        memo = (f"{self._store.storage!r}:{self._hash}", nag.id)
        with PROCESS.lock:
            first = memo not in PROCESS.nag_counted
            PROCESS.nag_counted.add(memo)
        if first:

            def count(s: StoredState) -> None:
                prev = s.nags.get(nag.id, {"runs": 0, "lastShown": None})
                s.nags[nag.id] = {"runs": int(prev.get("runs", 0)) + 1, "lastShown": prev.get("lastShown")}

            self._safe_update(count)
        interactive = _is_tty() if self._interactive is None else self._interactive
        if not force and (
            _flag(self._env.get("SPONSORKIT_NO_NAG")) or _flag(self._env.get("CI")) or not interactive
        ):
            return False
        fc = self.get_financial_contribution()
        if predicate is not None and not predicate(fc):
            return False
        state = self._read().nags.get(nag.id, {"runs": 0, "lastShown": None})
        if int(state.get("runs", 0)) >= nag.every:
            return True
        last = state.get("lastShown")
        if nag.or_every is not None and isinstance(last, str):
            shown_at = parse_iso(last)
            return shown_at is not None and self._now() - shown_at >= nag.or_every
        return False

    def _nag_shown(self, nag: Nag) -> None:
        if self._disabled:
            return
        shown_at = iso(self._now())

        def mark(s: StoredState) -> None:
            s.nags[nag.id] = {"runs": 0, "lastShown": shown_at}

        self._safe_update(mark)

    # ------------------------------------------------------------------ async variants

    async def ais_signed_in(self) -> bool:
        """Async variant of :meth:`is_signed_in`."""
        return await asyncio.to_thread(self.is_signed_in)

    async def aget_financial_contribution(self, *, cache_ttl: float | None = None) -> ContributionResult:
        """Async variant of :meth:`get_financial_contribution` (runs in a worker thread)."""
        return await asyncio.to_thread(lambda: self.get_financial_contribution(cache_ttl=cache_ttl))

    async def asign_in(
        self,
        provider: Provider | None = None,
        *,
        method: SignInMethod | None = None,
        timeout: float | None = None,
        cancel: threading.Event | asyncio.Event | None = None,
    ) -> ContributionResult:
        """Async variant of :meth:`sign_in`. Cancelling the awaiting task also cancels the sign-in."""
        return await _run_cancellable(
            lambda ev: self.sign_in(provider, method=method, timeout=timeout, cancel=ev), cancel
        )

    async def aopen_checkout(
        self,
        *,
        provider: Provider | None = None,
        amount: int | None = None,
        currency: str | None = None,
        frequency: Frequency | None = None,
        timeout: float = 600,
        cancel: threading.Event | asyncio.Event | None = None,
        method: SignInMethod | None = None,
        poll_interval: float | None = None,
    ) -> CheckoutResult:
        """Async variant of :meth:`open_checkout`.

        ``cancel`` may be an :class:`asyncio.Event` or a :class:`threading.Event`. Cancelling the
        awaiting task stops polling too (and propagates :class:`asyncio.CancelledError`).
        """
        return await _run_cancellable(
            lambda ev: self.open_checkout(
                provider=provider,
                amount=amount,
                currency=currency,
                frequency=frequency,
                timeout=timeout,
                cancel=ev,
                method=method,
                poll_interval=poll_interval,
            ),
            cancel,
        )

    async def asign_out(self) -> None:
        """Async variant of :meth:`sign_out`."""
        await asyncio.to_thread(self.sign_out)


async def _run_cancellable(
    fn: Callable[[threading.Event], _T], cancel: threading.Event | asyncio.Event | None
) -> _T:
    event = cancel if isinstance(cancel, threading.Event) else threading.Event()
    bridge: asyncio.Task[None] | None = None
    if isinstance(cancel, asyncio.Event):
        source = cancel

        async def forward() -> None:
            await source.wait()
            event.set()

        bridge = asyncio.ensure_future(forward())
    try:
        return await asyncio.to_thread(fn, event)
    except asyncio.CancelledError:
        event.set()
        raise
    finally:
        if bridge is not None:
            bridge.cancel()
