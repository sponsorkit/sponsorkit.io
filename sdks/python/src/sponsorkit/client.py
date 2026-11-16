"""The Sponsorkit client (SPEC §7.1)."""

from __future__ import annotations

import asyncio
import os
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
    iso,
    normalize_base_url,
    parse_iso,
    problem_code,
    retry_after_seconds,
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

LOOPBACK_TIMEOUT = 300.0
"""Native loopback sign-in gives up after 5 minutes (PROTOCOL §7)."""


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


def _default_open_browser(url: str) -> bool:
    try:
        return webbrowser.open(url)
    except webbrowser.Error:
        return False


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
        env: Environment used for ``SPONSORKIT_DISABLE``, ``SPONSORKIT_MOCK``, ``SPONSORKIT_NO_NAG`` and
            ``CI`` (default: ``os.environ``).
        dev_checks: Force the dev-time target existence check on or off. Default: on only in Python
            development mode (``python -X dev``).
        checkout_poll_interval: Seconds between checks while waiting for a checkout (default 60).
        clock: Returns the current time; injectable for tests.
        timeout: HTTP timeout in seconds for API calls.
        http_client: An :class:`httpx.Client` to use for API calls (proxies, custom transports).

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
        env: Mapping[str, str] | None = None,
        dev_checks: bool | None = None,
        checkout_poll_interval: float = 60.0,
        clock: Callable[[], datetime] | None = None,
        timeout: float = DEFAULT_HTTP_TIMEOUT,
        http_client: httpx.Client | None = None,
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
        if isinstance(cache_ttl, bool) or not isinstance(cache_ttl, (int, float)) or cache_ttl < 0:
            raise SponsorkitError("invalid_config", "cache_ttl must be a number of seconds")
        self._cache_ttl = max(60.0, float(cache_ttl))
        if checkout_poll_interval <= 0:
            raise SponsorkitError("invalid_config", "checkout_poll_interval must be positive")
        self._poll_interval = float(checkout_poll_interval)
        self._open_browser_hook = open_browser
        self._prompt = prompt_for_code or _default_prompt_for_code
        self._clock = clock
        self._timeout = timeout
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
        self._dev_checks = bool(sys.flags.dev_mode) if dev_checks is None else bool(dev_checks)

        backend: Storage
        if self._mock_state is not None or self._disabled:
            backend = MemoryStorage()  # mock and disabled modes never touch the disk
        elif storage is not None:
            backend = storage
        else:
            backend = FileStorage(Path(storage_dir) if storage_dir is not None else default_storage_dir())
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
                self._own_client = httpx.Client(
                    timeout=self._timeout, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
                )
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

    def _safe_update(self, fn: Callable[[StoredState], None]) -> None:
        try:
            self._store.update(fn)
        except OSError as e:
            log.warning("sponsorkit: could not write local storage: %s", e)

    def _read(self) -> StoredState:
        try:
            return self._store.read()
        except OSError as e:
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
            res = self._client().get(build_url(self._api, "/api/v1/targets", params))
            if res.status_code != 200:
                return
            body = res.json()
            missing = [
                str(t.get("target"))
                for t in body.get("targets", [])
                if isinstance(t, dict) and t.get("exists") is False
            ]
        except (httpx.HTTPError, ValueError, AttributeError):
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
                f"{self._api}/api/v1/contributions", headers={"Authorization": f"Bearer {token}"}
            )
        except httpx.HTTPError as e:
            log.info("sponsorkit: API unreachable, serving cache: %s", e)
            return fallback()

        if res.status_code == 401:
            self._clear_session()
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
        except (KeyError, TypeError, ValueError):
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
        renewed = res.headers.get("sponsorkit-session")
        stored_at = iso(self._now())

        def save(s: StoredState) -> None:
            if renewed and renewed.startswith("sks_"):
                s.session_token = renewed
            elif s.session_token is None:
                s.session_token = token
            s.cache = CacheEntry(result, stored_at)

        self._safe_update(save)
        return result

    def _clear_session(self) -> None:
        def clear(s: StoredState) -> None:
            s.session_token = None
            s.cache = None

        try:
            with self._store.lock:
                if not self._store.exists():
                    return
                state = self._store.read()
                clear(state)
                if state.empty:
                    self._store.storage.delete(self._store.key)
                else:
                    self._store.storage.write(self._store.key, state.dump())
        except OSError as e:
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
    ) -> str | None:
        """Run the browser part of sign-in. Returns the code, or ``None`` on timeout/cancellation."""
        resolved = self._resolve_method(method)
        if resolved in ("auto", "loopback"):
            receiver = LoopbackReceiver(continue_url)
            try:
                q = self._with_app({**params, "delivery": "loopback", "redirect_uri": receiver.redirect_uri})
                url = build_url(self._api, path, q)
                if not self._open(url):
                    if resolved == "auto":
                        resolved = "paste"
                    else:
                        print(f"Open this URL in a browser to continue:\n\n  {url}\n", file=sys.stderr)
                if resolved != "paste":
                    outcome = receiver.wait(min(deadline, time.monotonic() + LOOPBACK_TIMEOUT), cancel)
                    if outcome.kind == "code":
                        return outcome.value
                    if outcome.kind == "error":
                        code = outcome.value
                        if code not in ("access_denied", "invalid_state", "provider_error"):
                            code = "provider_error"
                        raise SponsorkitError(cast(Any, code), f"Sign-in failed: {outcome.value}")
                    return None
            finally:
                receiver.close()
        url = build_url(self._api, path, self._with_app({**params, "delivery": "paste"}))
        print(
            f"To sign in to Sponsorkit, open this URL in a browser on any device:\n\n  {url}\n",
            file=sys.stderr,
        )
        if cancel is not None and cancel.is_set():
            return None
        code = (self._prompt(url) or "").strip()
        if not code:
            raise SponsorkitError("invalid_code", "No sign-in code was entered")
        return code

    def _exchange(self, code: str, verifier: str) -> ContributionResult:
        stored = self._read()
        body: dict[str, str] = {"code": code, "codeVerifier": verifier}
        if stored.session_token:
            body["sessionToken"] = stored.session_token
        for _attempt in range(2):
            try:
                res = self._client().post(f"{self._api}/api/v1/auth/token", json=body)
            except httpx.HTTPError as e:
                raise SponsorkitError("network_error", f"Could not reach the Sponsorkit API: {e}") from e
            request_id = res.headers.get("sponsorkit-request-id")
            try:
                data: Any = res.json()
            except ValueError:
                data = None
            if res.status_code == 401 and "sessionToken" in body:
                # The stored session is no longer valid: start a fresh session with this identity.
                self._clear_session()
                del body["sessionToken"]
                continue
            if res.status_code == 400:
                raise SponsorkitError(
                    "invalid_code",
                    f"The sign-in code could not be exchanged ({problem_code(data) or 'invalid_code'})",
                    request_id=request_id,
                )
            if res.status_code != 200:
                raise SponsorkitError(
                    "internal", f"Sponsorkit API error {res.status_code}", request_id=request_id
                )
            try:
                session_token = data["sessionToken"]
                if not isinstance(session_token, str) or not session_token.startswith("sks_"):
                    raise TypeError("sessionToken")
                result = replace(ContributionResult.from_dict(data["result"]), from_cache=False)
            except (KeyError, TypeError, ValueError) as e:
                raise SponsorkitError(
                    "internal", f"Malformed token response: {e}", request_id=request_id
                ) from e
            self._save_session(session_token, result)
            return result
        raise SponsorkitError("internal", "Sign-in failed")  # pragma: no cover

    def _save_session(self, session_token: str, result: ContributionResult) -> None:
        """Store the new token and cache the token response's result (PROTOCOL §7.1 rule 1)."""
        entry = CacheEntry(result, iso(self._now()))

        def save(s: StoredState) -> None:
            s.session_token = session_token
            s.cache = entry

        try:
            self._store.update(save)
        except OSError as e:
            raise SponsorkitError("internal", f"Could not store the session: {e}") from e

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
        timeout: float = LOOPBACK_TIMEOUT,
        cancel: threading.Event | None = None,
    ) -> ContributionResult:
        """Sign the user in (or add another provider identity when already signed in).

        Opens the consent page in the browser (loopback) or prints a URL and asks for the code
        (paste-back). ``provider`` skips the provider picker; signing in with a second provider adds
        that identity to the existing session. Returns the fresh result, which is also cached.

        Raises:
            SponsorkitError: ``disabled``, ``access_denied``, ``invalid_state``, ``provider_error``,
                ``invalid_code``, ``network_error``, ``internal``, ``timeout`` (5 minutes by default)
                or ``cancelled``.
        """
        if self._disabled:
            raise SponsorkitError("disabled", "Sponsorkit is disabled (SPONSORKIT_DISABLE)")
        prov = self._check_provider(provider)
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
        deadline = time.monotonic() + timeout
        code = self._acquire_code("/connect", params, method, deadline, cancel)
        if code is None:
            if cancel is not None and cancel.is_set():
                raise SponsorkitError("cancelled", "Sign-in was cancelled")
            raise SponsorkitError("timeout", "Sign-in did not complete in time")
        return self._exchange(code, verifier)

    # ------------------------------------------------------------------ checkout

    def _checkout_options(
        self, provider: str | None, amount: int | None, currency: str | None, frequency: str | None
    ) -> _CheckoutOptions:
        prov = self._check_provider(provider)
        if amount is not None and (isinstance(amount, bool) or not isinstance(amount, int) or amount < 0):
            raise SponsorkitError("invalid_config", "amount must be a non-negative integer in minor units")
        if currency is not None and (
            not isinstance(currency, str)
            or len(currency) != 3
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

        Signs in first if needed (so the contribution can be detected), opens the checkout page,
        then re-checks every ``poll_interval`` seconds (default: ``checkout_poll_interval``) until a
        new or changed contribution appears. Resolves ``CheckoutResult("unknown")`` on ``timeout``
        (seconds, default 10 minutes) or when ``cancel`` is set; it does not raise for those.

        Raises:
            SponsorkitError: ``disabled``, ``invalid_config`` or a sign-in error.
        """
        if self._disabled:
            raise SponsorkitError("disabled", "Sponsorkit is disabled (SPONSORKIT_DISABLE)")
        opts = self._checkout_options(provider, amount, currency, frequency)
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
        deadline = time.monotonic() + timeout
        interval = self._poll_interval if poll_interval is None else float(poll_interval)
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
            continue_url = build_url(self._api, "/checkout", {**query, "step": "choose"})
            code = self._acquire_code(
                "/checkout",
                {**query, "challenge": code_challenge(verifier)},
                method,
                deadline,
                cancel,
                continue_url,
            )
            if code is None:
                return CheckoutResult("unknown")
            baseline = self._exchange(code, verifier)

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
        """Delete the stored session token and cached result. Nag state is kept. No network access."""
        if self._disabled:
            return
        if self._mock_state is not None:
            self._mock_state = _MockState(False, [])
            return
        self._clear_session()

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
        if not force and (
            _flag(self._env.get("SPONSORKIT_NO_NAG")) or _flag(self._env.get("CI")) or not _is_tty()
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
        timeout: float = LOOPBACK_TIMEOUT,
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
