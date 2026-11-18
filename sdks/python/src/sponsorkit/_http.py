"""HTTP helpers shared by the client and the server helper."""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlencode, urlsplit

import httpx

from ._version import __version__
from .errors import SponsorkitError

DEFAULT_API_BASE_URL = "https://api.sponsorkit.io"
"""Default ``api_base_url``: the Sponsorkit API origin (PROTOCOL §7)."""
DEFAULT_SITE_BASE_URL = "https://sponsorkit.github.io/sponsorkit.io"
"""Default ``site_base_url``: the Sponsorkit site (sign-in and checkout pages, PROTOCOL §7)."""
USER_AGENT = f"sponsorkit-python/{__version__}"
DEFAULT_HTTP_TIMEOUT = 30.0
"""Default per-request timeout in seconds (PROTOCOL §7.0); ``request_timeout=0`` disables it."""
MAX_RETRY_AFTER = 86400.0
"""Upper bound for an honoured ``Retry-After`` (24 h); larger values are clamped."""

_SESSION_TOKEN = re.compile(r"sks_[\x21-\x7e]+")


def is_session_token(value: object) -> bool:
    """Whether ``value`` looks like a session token: ``sks_`` then printable ASCII (header-safe)."""
    return isinstance(value, str) and _SESSION_TOKEN.fullmatch(value) is not None


def resolve_request_timeout(value: object, name: str = "request_timeout") -> float | None:
    """Validate a ``request_timeout`` (seconds, finite, ``>= 0``) and return the httpx timeout.

    ``0`` disables the timeout (``None`` for httpx).
    """
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or value < 0
    ):
        raise SponsorkitError("invalid_config", f"{name} must be a non-negative number of seconds")
    return None if value == 0 else float(value)


def normalize_base_url(url: str, name: str = "api_base_url") -> str:
    """Validate a base URL (an origin, optionally with a path prefix) and normalize it.

    Surrounding whitespace is ignored; scheme and host are lowercased, a default port is dropped
    and trailing slashes are trimmed. A query, fragment or userinfo is ``invalid_config``
    (PROTOCOL §7: an origin plus an optional path), matching the other SDKs.
    """
    if not isinstance(url, str):
        raise SponsorkitError("invalid_config", f"{name} must be a string")
    raw = url.strip()
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError:
        raise SponsorkitError("invalid_config", f'Invalid {name} "{url}"') from None
    scheme = parts.scheme.lower()
    host = parts.hostname
    if scheme not in ("http", "https") or not host:
        raise SponsorkitError("invalid_config", f'{name} must be an http(s) URL, got "{url}"')
    if (
        parts.query
        or parts.fragment
        or "?" in raw
        or "#" in raw
        or parts.username is not None
        or parts.password is not None
        or any(c.isspace() or ord(c) < 0x20 or ord(c) == 0x7F for c in raw)
    ):
        raise SponsorkitError(
            "invalid_config", f'{name} must be an origin plus an optional path, got "{url}"'
        )
    if ":" in host:
        host = f"[{host}]"
    if port is not None and port != (443 if scheme == "https" else 80):
        host = f"{host}:{port}"
    return f"{scheme}://{host}{parts.path.rstrip('/')}"


def resolve_base_urls(api_base_url: str | None, site_base_url: str | None) -> tuple[str, str]:
    """``(api, site)`` base URLs after the PROTOCOL §7 defaulting rule, trailing slashes trimmed.

    ``None`` and ``""`` count as unset. An unset ``api_base_url`` is :data:`DEFAULT_API_BASE_URL`.
    An unset ``site_base_url`` is ``api_base_url`` when that was set (single-origin self-hosting
    and tests), else :data:`DEFAULT_SITE_BASE_URL`.
    """
    api = normalize_base_url(api_base_url) if api_base_url != "" and api_base_url is not None else None
    site = (
        normalize_base_url(site_base_url, "site_base_url")
        if site_base_url != "" and site_base_url is not None
        else None
    )
    return api or DEFAULT_API_BASE_URL, site or api or DEFAULT_SITE_BASE_URL


def build_url(base: str, path: str, params: Mapping[str, str]) -> str:
    """``<base><path>?<urlencoded params>``."""
    return f"{base}{path}?{urlencode(dict(params))}" if params else f"{base}{path}"


def problem_code(body: Any) -> str | None:
    """The ``code`` of an ``application/problem+json`` body, if any."""
    if isinstance(body, dict) and isinstance(body.get("code"), str):
        return str(body["code"])
    return None


def parse_retry_after(value: str | None, now: datetime) -> float | None:
    """Parse ``Retry-After`` (delta seconds or HTTP date); ``None`` when absent or invalid.

    Non-finite values are invalid; finite ones are clamped to ``[0, MAX_RETRY_AFTER]``.
    """
    if not value or not value.strip():
        return None
    value = value.strip()
    seconds: float
    try:
        seconds = float(value)
    except ValueError:
        try:
            when = parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            return None
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        seconds = (when - now).total_seconds()
    if not math.isfinite(seconds):
        return None
    return min(MAX_RETRY_AFTER, max(0.0, seconds))


def retry_after_seconds(value: str | None, now: datetime) -> float:
    """Parse ``Retry-After`` (delta seconds or HTTP date). Defaults to 60 s."""
    parsed = parse_retry_after(value, now)
    return 60.0 if parsed is None else parsed


def unexpected_response(response: httpx.Response, what: str, body: Any = None) -> SponsorkitError:
    """``network_error`` for a 5xx, 429 or otherwise unexpected API response (PROTOCOL §7).

    Carries ``retry_after`` when the API sent ``Retry-After``.
    """
    code = problem_code(body)
    detail = f"{response.status_code}" + (f" {code}" if code else "")
    return SponsorkitError(
        "network_error",
        f"{what}: unexpected API response ({detail})",
        request_id=response.headers.get("sponsorkit-request-id"),
        retry_after=parse_retry_after(response.headers.get("retry-after"), datetime.now(timezone.utc)),
    )


def iso(dt: datetime) -> str:
    """ISO-8601 UTC with milliseconds and a ``Z`` suffix."""
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


_FRACTION = re.compile(r"(T\d{2}:\d{2}:\d{2})[.,](\d+)")


def parse_iso(value: str) -> datetime | None:
    """Parse an ISO-8601 date-time (``Z`` or offset); ``None`` if invalid. Naive values are UTC.

    Fractional seconds of any length are accepted (Python 3.10's ``fromisoformat`` only takes 3 or 6
    digits, while e.g. the .NET SDK drops trailing zeros), so they are normalized to 6 digits first.
    """
    try:
        text = value.strip().replace("Z", "+00:00").replace("z", "+00:00")
        text = _FRACTION.sub(lambda m: f"{m.group(1)}.{(m.group(2) + '000000')[:6]}", text, count=1)
        dt = datetime.fromisoformat(text)
    except (ValueError, AttributeError, TypeError):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
