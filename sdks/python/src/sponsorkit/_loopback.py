"""The native loopback sign-in receiver (PROTOCOL §7, RFC 8252 §7.3)."""

from __future__ import annotations

import html
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Literal
from urllib.parse import parse_qs, urlsplit

_PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Sponsorkit</title>
<style>body{{font-family:system-ui,sans-serif;margin:4rem auto;max-width:32rem;text-align:center}}</style>
</head><body><h1>{title}</h1><p>You can close this window.</p></body></html>"""


@dataclass(frozen=True)
class CallbackOutcome:
    """What the loopback wait ended with."""

    kind: Literal["code", "error", "timeout", "cancelled"]
    value: str = ""


class LoopbackReceiver:
    """Listens on ``127.0.0.1:<random>`` for ``GET /callback?code=…`` or ``?error=…``.

    A callback with neither a non-empty ``code`` nor a non-empty ``error`` gets ``400`` and is
    otherwise ignored. Construction raises :class:`OSError` when the receiver cannot bind.

    ``redirect_after_code``: when set, a successful callback answers ``302`` to that URL (checkout
    continues in the same browser tab) instead of the "You can close this window" page.
    """

    def __init__(self, redirect_after_code: str | None = None) -> None:
        self._redirect = redirect_after_code
        self._done = threading.Event()
        self._outcome: CallbackOutcome | None = None
        self._lock = threading.Lock()
        receiver = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                parts = urlsplit(self.path)
                if parts.path != "/callback":
                    self._send(404, "text/plain; charset=utf-8", b"Not found")
                    return
                q = parse_qs(parts.query)
                code = (q.get("code") or [""])[0]
                error = (q.get("error") or [""])[0]
                if not code and not error:
                    # PROTOCOL §7.0: neither a code nor an error (e.g. a stray or prefetch request).
                    # Answer 400 and keep waiting for the real callback.
                    self._send(400, "text/plain; charset=utf-8", b"Missing code or error")
                    return
                first = receiver._deliver(
                    CallbackOutcome("code", code)
                    if code
                    else CallbackOutcome("error", error)
                )
                if code and first and receiver._redirect:
                    self.send_response(302)
                    self.send_header("Location", receiver._redirect)
                    self.send_header("Content-Length", "0")
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    return
                title = "Signed in to Sponsorkit" if code else f"Sign-in failed ({html.escape(error)})"
                self._send(200, "text/html; charset=utf-8", _PAGE.format(title=title).encode("utf-8"))

            def _send(self, status: int, content_type: str, body: bytes) -> None:
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, format: str, *args: object) -> None:
                return

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._server.daemon_threads = True
        self._thread = threading.Thread(
            target=self._server.serve_forever,
            kwargs={"poll_interval": 0.05},
            name="sponsorkit-loopback",
            daemon=True,
        )
        self._thread.start()

    @property
    def redirect_uri(self) -> str:
        """``http://127.0.0.1:<port>/callback``."""
        return f"http://127.0.0.1:{self._server.server_address[1]}/callback"

    def _deliver(self, outcome: CallbackOutcome) -> bool:
        with self._lock:
            if self._outcome is not None:
                return False
            self._outcome = outcome
            self._done.set()
            return True

    @property
    def outcome(self) -> CallbackOutcome | None:
        """The callback received so far, if any (non-blocking)."""
        with self._lock:
            return self._outcome

    def wait(self, deadline: float, cancel: threading.Event | None) -> CallbackOutcome:
        """Block until a callback arrives, ``deadline`` (monotonic) passes, or ``cancel`` is set."""
        while True:
            if self._done.is_set() and self._outcome is not None:
                return self._outcome
            if cancel is not None and cancel.is_set():
                return CallbackOutcome("cancelled")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return CallbackOutcome("timeout")
            self._done.wait(min(remaining, 0.05 if cancel is not None else remaining))

    def close(self) -> None:
        """Stop listening."""
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=5)
