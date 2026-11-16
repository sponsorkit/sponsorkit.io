"""The single exception type raised by Sponsorkit."""

from __future__ import annotations

from typing import Literal

__all__ = ["ErrorCode", "SponsorkitError"]

ErrorCode = Literal[
    "invalid_config",
    "disabled",
    "popup_blocked",
    "access_denied",
    "invalid_state",
    "provider_error",
    "invalid_code",
    "session_invalid",
    "targets_mismatch",
    "network_error",
    "internal",
    "timeout",
    "cancelled",
]
"""Every value :attr:`SponsorkitError.code` can take.

* ``invalid_config``: no targets, a malformed target, an invalid option, an unknown mock preset,
  or (dev-time check) a target that does not exist.
* ``disabled``: ``SPONSORKIT_DISABLE`` is set; raised by sign-in and checkout.
* ``popup_blocked``: browser SDKs only; never raised by the Python SDK.
* ``access_denied`` / ``invalid_state`` / ``provider_error``: sign-in errors delivered by the
  sign-in page.
* ``invalid_code``: the sign-in code could not be exchanged (malformed, expired, wrong verifier).
* ``session_invalid`` / ``targets_mismatch``: only raised by :func:`sponsorkit.server.verify_session`.
* ``network_error``: sign-in or :func:`~sponsorkit.server.verify_session` could not reach the API.
* ``internal``: the API answered sign-in or verification with an unexpected error.
* ``timeout``: sign-in did not complete in time (5 minutes by default).
* ``cancelled``: sign-in was cancelled through its ``cancel`` event.

``get_financial_contribution()`` never raises for network or server problems.
"""


class SponsorkitError(Exception):
    """An error raised by Sponsorkit. Inspect :attr:`code` to handle it programmatically.

    Example::

        try:
            sk.sign_in()
        except SponsorkitError as e:
            if e.code == "access_denied":
                print("Sign-in was cancelled at the provider.")
    """

    code: ErrorCode
    """Stable, machine-readable error code (see :data:`ErrorCode`)."""

    request_id: str | None
    """The ``Sponsorkit-Request-Id`` of the failed API response, when there was one."""

    def __init__(self, code: ErrorCode, message: str | None = None, *, request_id: str | None = None) -> None:
        super().__init__(message or code)
        self.code = code
        self.request_id = request_id

    def __repr__(self) -> str:
        return f"SponsorkitError(code={self.code!r}, message={str(self)!r})"
