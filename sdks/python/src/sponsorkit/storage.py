"""Local storage (PROTOCOL §8, SPEC §7.6).

The storage directory holds one JSON file per target set, named ``<targets_hash>.json``::

    { "v": 1, "sessionToken": "sks_…", "cache": { "result": {…}, "storedAt": "ISO-8601" },
      "nags": { "<id>": { "runs": 3, "lastShown": "ISO-8601" | null } } }

Writes are atomic (temp file + rename). The directory is created ``0700`` and files are ``0600``.
"""

from __future__ import annotations

import contextlib
import os
import secrets
import sys
import threading
from collections.abc import Mapping
from pathlib import Path
from typing import Protocol, runtime_checkable

__all__ = ["FileStorage", "MemoryStorage", "Storage", "default_storage_dir"]


@runtime_checkable
class Storage(Protocol):
    """A key/value store for the SDK's state. Keys are ``targets_hash`` values; values are JSON text.

    Implement this to keep Sponsorkit's state somewhere else (for example an OS keychain).
    Implementations must make :meth:`write` atomic: a concurrent :meth:`read` sees either the old
    or the new value, never a partial one.
    """

    def read(self, key: str) -> str | None:
        """Return the stored JSON text, or ``None`` if nothing is stored."""
        ...

    def write(self, key: str, data: str) -> None:
        """Atomically replace the stored JSON text."""
        ...

    def delete(self, key: str) -> None:
        """Remove the stored value, if any."""
        ...


def default_storage_dir(env: Mapping[str, str] | None = None) -> Path:
    r"""Return the per-user config directory used when no ``storage_dir`` is given.

    * Linux and other POSIX: ``$XDG_CONFIG_HOME/sponsorkit`` (default ``~/.config/sponsorkit``)
    * macOS: ``~/Library/Application Support/sponsorkit``
    * Windows: ``%APPDATA%\\sponsorkit``
    """
    e = os.environ if env is None else env
    if sys.platform == "win32":
        base = e.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(base) / "sponsorkit"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "sponsorkit"
    xdg = e.get("XDG_CONFIG_HOME")
    return Path(xdg if xdg else Path.home() / ".config") / "sponsorkit"


class FileStorage:
    """Stores ``<key>.json`` files in a directory (the default storage).

    The directory is created (mode ``0700``) on the first write; files are written ``0600`` via a
    temporary ``<file>.<random>.tmp`` that is renamed over the target file.
    """

    def __init__(self, directory: str | os.PathLike[str]) -> None:
        self.directory = Path(directory)

    def __repr__(self) -> str:
        return f"FileStorage({str(self.directory)!r})"

    def path(self, key: str) -> Path:
        """The file that holds ``key``."""
        return self.directory / f"{key}.json"

    def read(self, key: str) -> str | None:
        """Read the file, or ``None`` if it does not exist."""
        try:
            return self.path(key).read_text(encoding="utf-8")
        except FileNotFoundError:
            return None

    def _ensure_dir(self) -> None:
        if self.directory.is_dir():
            return
        os.makedirs(self.directory, mode=0o700, exist_ok=True)
        if os.name == "posix":
            with contextlib.suppress(OSError):
                os.chmod(self.directory, 0o700)

    def write(self, key: str, data: str) -> None:
        """Write atomically: temp file (``0600``), fsync, rename."""
        self._ensure_dir()
        target = self.path(key)
        tmp = target.with_name(f"{target.name}.{secrets.token_hex(6)}.tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data.encode("utf-8"))
                f.flush()
                os.fsync(f.fileno())
            if os.name == "posix":
                os.chmod(tmp, 0o600)
            os.replace(tmp, target)
        except BaseException:
            with contextlib.suppress(OSError):
                os.unlink(tmp)
            raise

    def delete(self, key: str) -> None:
        """Delete the file if it exists."""
        with contextlib.suppress(FileNotFoundError):
            self.path(key).unlink()


class MemoryStorage:
    """In-memory storage: nothing touches the disk. Useful for tests and ephemeral environments."""

    def __init__(self) -> None:
        self._data: dict[str, str] = {}
        self._lock = threading.Lock()

    def read(self, key: str) -> str | None:
        """Return the stored value."""
        with self._lock:
            return self._data.get(key)

    def write(self, key: str, data: str) -> None:
        """Replace the stored value."""
        with self._lock:
            self._data[key] = data

    def delete(self, key: str) -> None:
        """Remove the stored value."""
        with self._lock:
            self._data.pop(key, None)
