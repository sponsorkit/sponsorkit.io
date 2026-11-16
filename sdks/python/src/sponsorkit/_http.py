"""HTTP helpers shared by the client and the server helper."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlencode, urlsplit

from ._version import __version__
from .errors import SponsorkitError

DEFAULT_API_BASE_URL = "https://sponsorkit.io"
USER_AGENT = f"sponsorkit-python/{__version__}"
DEFAULT_HTTP_TIMEOUT = 10.0


def normalize_base_url(url: str) -> str:
    """Validate ``api_base_url`` (an origin, optionally with a path prefix) and strip trailing slashes."""
    if not isinstance(url, str):
        raise SponsorkitError("invalid_config", "api_base_url must be a string")
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise SponsorkitError("invalid_config", f'api_base_url must be an http(s) URL, got "{url}"')
    return url.rstrip("/")


def build_url(base: str, path: str, params: Mapping[str, str]) -> str:
    """``<base><path>?<urlencoded params>``."""
    return f"{base}{path}?{urlencode(dict(params))}" if params else f"{base}{path}"


def problem_code(body: Any) -> str | None:
    """The ``code`` of an ``application/problem+json`` body, if any."""
    if isinstance(body, dict) and isinstance(body.get("code"), str):
        return str(body["code"])
    return None


def retry_after_seconds(value: str | None, now: datetime) -> float:
    """Parse ``Retry-After`` (delta seconds or HTTP date). Defaults to 60 s."""
    if not value:
        return 60.0
    value = value.strip()
    try:
        return max(0.0, float(value))
    except ValueError:
        pass
    try:
        when = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return 60.0
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return max(0.0, (when - now).total_seconds())


def iso(dt: datetime) -> str:
    """ISO-8601 UTC with milliseconds and a ``Z`` suffix."""
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_iso(value: str) -> datetime | None:
    """Parse an ISO-8601 date-time (``Z`` or offset); ``None`` if invalid. Naive values are UTC."""
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00").replace("z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
