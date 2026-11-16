"""PKCE helpers (PROTOCOL §2, RFC 7636 S256)."""

from __future__ import annotations

import base64
import hashlib
import secrets

__all__ = ["base64url", "code_challenge", "generate_code_verifier"]


def base64url(data: bytes) -> str:
    """Base64url without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def generate_code_verifier() -> str:
    """32 random bytes, base64url-encoded: a 43-character code verifier."""
    return base64url(secrets.token_bytes(32))


def code_challenge(verifier: str) -> str:
    """``base64url(sha256(ascii(verifier)))`` without padding."""
    return base64url(hashlib.sha256(verifier.encode("ascii")).digest())
