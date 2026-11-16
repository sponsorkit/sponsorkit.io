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
    "cancelled",
    "timeout",
    "network_error",
    "session_invalid",
    "targets_mismatch",
]
"""Every value :attr:`SponsorkitError.code` can take (PROTOCOL §7, "SDK error codes").

* ``invalid_config``: no targets, a malformed target, an invalid option (including invalid
  :meth:`~sponsorkit.Sponsorkit.checkout_url` options), an unknown mock preset, an unwritable
  storage directory, or (dev-time check) a target that does not exist.
* ``disabled``: ``SPONSORKIT_DISABLE`` is set; raised by sign-in and checkout.
* ``popup_blocked``: browser SDKs only; never raised by the Python SDK.
* ``access_denied`` / ``invalid_state`` / ``provider_error``: sign-in errors delivered by the
  sign-in page to the loopback callback.
* ``invalid_code``: the API rejected the code exchange (``400 invalid_code``: malformed, expired or
  tampered code, or a verifier mismatch).
* ``cancelled``: sign-in was cancelled through its ``cancel`` event, by cancelling the awaiting
  task, or the user entered no code at the paste-back prompt.
* ``timeout``: sign-in did not complete within ``sign_in_timeout`` (300 s by default).
* ``network_error``: sign-in or :func:`~sponsorkit.server.verify_session` could not reach the API,
  or it answered ``5xx``, ``429`` or something unexpected. :attr:`SponsorkitError.retry_after`
  carries the API's ``Retry-After`` in seconds when it sent one.
* ``session_invalid`` / ``targets_mismatch``: only raised by :func:`sponsorkit.server.verify_session`.

``get_financial_contribution()`` never raises for network or server problems.
"""


class SponsorkitError(Exception):
    """An error raised by Sponsorkit. Inspect :attr:`code` to handle it programmatically.

    Example::

        try:
            sk.sign_in()
        except SponsorkitError as e:
            if e.code == "access_denied":
                print("Sign-in was declined at the provider.")
            elif e.code == "network_error" and e.retry_after is not None:
                print(f"Try again in {e.retry_after:.0f} s.")
    """

    code: ErrorCode
    """Stable, machine-readable error code (see :data:`ErrorCode`)."""

    request_id: str | None
    """The ``Sponsorkit-Request-Id`` of the failed API response, when there was one."""

    retry_after: float | None
    """``network_error`` only: seconds from the API's ``Retry-After`` header, when it sent one."""

    def __init__(
        self,
        code: ErrorCode,
        message: str | None = None,
        *,
        request_id: str | None = None,
        retry_after: float | None = None,
    ) -> None:
        super().__init__(message or code)
        self.code = code
        self.request_id = request_id
        self.retry_after = retry_after

    def __repr__(self) -> str:
        return f"SponsorkitError(code={self.code!r}, message={str(self)!r})"
