"""Per-process memo state and the parsed storage file."""

from __future__ import annotations

import json
import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .models import ContributionResult
from .storage import FileStorage, Storage

log = logging.getLogger("sponsorkit")


class _ProcessState:
    """State that lives for one process: reset by :func:`sponsorkit.reset_process_state`."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.nag_counted: set[tuple[str, str]] = set()
        self.dev_checks: dict[tuple[str, str], _DevCheck] = {}
        self.retry_until: dict[tuple[str, str], datetime] = {}

    def reset(self) -> None:
        with self.lock:
            self.nag_counted.clear()
            self.dev_checks.clear()
            self.retry_until.clear()


class _DevCheck:
    """A once-per-process existence check whose outcome every caller shares."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.done = False
        self.error: BaseException | None = None


PROCESS = _ProcessState()


def reset_process_state() -> None:
    """Forget per-process memo state, as if the app had been restarted.

    Clears the nag runs already counted in this process, the dev-time target check memo and the
    ``Retry-After`` memo. Intended for tests.
    """
    PROCESS.reset()


_locks_guard = threading.Lock()
_locks: dict[object, threading.RLock] = {}


def storage_lock(storage: Storage, key: str) -> threading.RLock:
    """One lock per stored file (per path for :class:`FileStorage`) for in-process read-modify-write."""
    ident: object = (
        ("file", str(storage.path(key).resolve())) if isinstance(storage, FileStorage) else (id(storage), key)
    )
    with _locks_guard:
        lock = _locks.get(ident)
        if lock is None:
            lock = _locks[ident] = threading.RLock()
        return lock


@dataclass
class CacheEntry:
    """The cached result and when it was stored."""

    result: ContributionResult
    stored_at: str


@dataclass
class StoredState:
    """The parsed storage file. Unknown top-level keys are preserved."""

    session_token: str | None = None
    cache: CacheEntry | None = None
    nags: dict[str, dict[str, Any]] = field(default_factory=dict)
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def parse(cls, text: str | None) -> StoredState:
        if not text:
            return cls()
        try:
            data = json.loads(text)
        except ValueError:
            log.warning("sponsorkit: ignoring a corrupt storage file")
            return cls()
        if not isinstance(data, dict) or data.get("v") != 1:
            return cls()
        state = cls(extra={k: v for k, v in data.items() if k not in ("v", "sessionToken", "cache", "nags")})
        token = data.get("sessionToken")
        if isinstance(token, str) and token.startswith("sks_"):
            state.session_token = token
        cache = data.get("cache")
        if isinstance(cache, dict) and isinstance(cache.get("storedAt"), str):
            try:
                state.cache = CacheEntry(ContributionResult.from_dict(cache["result"]), cache["storedAt"])
            except (KeyError, TypeError, ValueError):
                log.warning("sponsorkit: ignoring a malformed cache entry")
        nags = data.get("nags")
        if isinstance(nags, dict):
            for nag_id, n in nags.items():
                if not isinstance(n, dict):
                    continue
                runs = n.get("runs")
                last = n.get("lastShown")
                state.nags[nag_id] = {
                    "runs": runs if isinstance(runs, int) and not isinstance(runs, bool) and runs >= 0 else 0,
                    "lastShown": last if isinstance(last, str) else None,
                }
        return state

    def dump(self) -> str:
        out: dict[str, Any] = {**self.extra, "v": 1}
        if self.session_token:
            out["sessionToken"] = self.session_token
        if self.cache:
            out["cache"] = {"result": self.cache.result.to_dict(), "storedAt": self.cache.stored_at}
        if self.nags:
            out["nags"] = self.nags
        return json.dumps(out, separators=(",", ":"))

    @property
    def empty(self) -> bool:
        return not (self.session_token or self.cache or self.nags or self.extra)


class StateStore:
    """Read-modify-write access to one target set's stored state."""

    def __init__(self, storage: Storage, key: str) -> None:
        self.storage = storage
        self.key = key
        self.lock = storage_lock(storage, key)

    def read(self) -> StoredState:
        return StoredState.parse(self.storage.read(self.key))

    def exists(self) -> bool:
        return self.storage.read(self.key) is not None

    def update(self, fn: Callable[[StoredState], None]) -> StoredState:
        """Apply ``fn`` to the freshly read state and write it back atomically."""
        with self.lock:
            state = self.read()
            fn(state)
            self.storage.write(self.key, state.dump())
            return state
