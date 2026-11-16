"""Backend verification (SPEC §6.4): check a supporter's session token without any key.

Your frontend or CLI sends its Sponsorkit session token (``sks_…``) to your backend, which calls
:func:`verify_session`. The token is sealed by Sponsorkit, so it cannot be forged; the helper also
checks that the session is bound to *your* target set. Nothing is stored.

Example::

    from sponsorkit.server import verify_session

    fc = verify_session(token, {"github": "octocat"})
    if fc.active():
        unlock_pro_features()
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any, TypeAlias

import httpx

from ._http import (
    DEFAULT_API_BASE_URL,
    DEFAULT_HTTP_TIMEOUT,
    USER_AGENT,
    is_session_token,
    normalize_base_url,
    problem_code,
    resolve_request_timeout,
    unexpected_response,
)
from .errors import SponsorkitError
from .models import ContributionResult
from .targets import Target, coerce_targets, targets_param

__all__ = ["TargetsArg", "averify_session", "verify_session"]

TargetsArg: TypeAlias = "Mapping[str, str | None] | str | Iterable[str | Target]"
"""Targets as ``{"github": ..., "opencollective": ...}``, a target param, or a list of target strings."""


def _prepare(token: str, targets: TargetsArg, api_base_url: str) -> tuple[str, str, dict[str, str]]:
    expected = targets_param(coerce_targets(targets))
    base = normalize_base_url(api_base_url)
    if not isinstance(token, str) or not token.strip():
        raise SponsorkitError("session_invalid", "No session token was given")
    token = token.strip()
    if not is_session_token(token):
        # Also keeps non-ASCII input out of the Authorization header, which httpx cannot encode.
        raise SponsorkitError("session_invalid", "The session token is malformed")
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    return expected, f"{base}/api/v1/contributions", headers


def _interpret(expected: str, response: httpx.Response) -> ContributionResult:
    request_id = response.headers.get("sponsorkit-request-id")
    body: Any
    try:
        body = response.json()
    except (ValueError, RecursionError):
        body = None
    if response.status_code == 401 or problem_code(body) == "session_invalid":
        raise SponsorkitError(
            "session_invalid", "The session token is invalid or expired", request_id=request_id
        )
    if response.status_code != 200:
        raise unexpected_response(response, "Could not verify the session", body)
    try:
        result = ContributionResult.from_dict(body)
    except (KeyError, TypeError, ValueError, AttributeError) as e:
        raise SponsorkitError("network_error", f"Malformed API response: {e}", request_id=request_id) from e
    if ",".join(result.targets) != expected:
        raise SponsorkitError(
            "targets_mismatch",
            f"The session is bound to {','.join(result.targets)!r}, expected {expected!r}",
            request_id=request_id,
        )
    return result


def verify_session(
    token: str,
    targets: TargetsArg,
    *,
    api_base_url: str = DEFAULT_API_BASE_URL,
    request_timeout: float = DEFAULT_HTTP_TIMEOUT,
    http_client: httpx.Client | None = None,
    timeout: float | None = None,
) -> ContributionResult:
    """Verify a session token and return the supporter's live contributions.

    Calls ``GET /api/v1/contributions`` with the token and checks that the session's target set equals
    ``targets`` (after normalization). Touches no local storage.

    ``request_timeout`` bounds the HTTP request in seconds (default 30, ``0`` disables it); it also
    applies when ``http_client`` is given. A timeout raises ``network_error``. ``timeout`` is a
    deprecated alias of ``request_timeout``.

    Raises:
        SponsorkitError: ``session_invalid`` (rejected or malformed token), ``targets_mismatch``
            (bound to other targets), ``invalid_config`` (bad ``targets`` or ``request_timeout``) or
            ``network_error``
            (API unreachable, ``5xx``, ``429`` or an unexpected response; ``retry_after`` carries
            the API's ``Retry-After`` in seconds when it sent one).
    """
    expected, url, headers = _prepare(token, targets, api_base_url)
    limit = resolve_request_timeout(request_timeout if timeout is None else timeout)
    try:
        if http_client is not None:
            response = http_client.get(url, headers=headers, timeout=limit)
        else:
            with httpx.Client(timeout=limit) as client:
                response = client.get(url, headers=headers)
    except httpx.HTTPError as e:
        raise SponsorkitError("network_error", f"Could not reach the Sponsorkit API: {e}") from e
    return _interpret(expected, response)


async def averify_session(
    token: str,
    targets: TargetsArg,
    *,
    api_base_url: str = DEFAULT_API_BASE_URL,
    request_timeout: float = DEFAULT_HTTP_TIMEOUT,
    http_client: httpx.AsyncClient | None = None,
    timeout: float | None = None,
) -> ContributionResult:
    """Async variant of :func:`verify_session` (uses :class:`httpx.AsyncClient`)."""
    expected, url, headers = _prepare(token, targets, api_base_url)
    limit = resolve_request_timeout(request_timeout if timeout is None else timeout)
    try:
        if http_client is not None:
            response = await http_client.get(url, headers=headers, timeout=limit)
        else:
            async with httpx.AsyncClient(timeout=limit) as client:
                response = await client.get(url, headers=headers)
    except httpx.HTTPError as e:
        raise SponsorkitError("network_error", f"Could not reach the Sponsorkit API: {e}") from e
    return _interpret(expected, response)
