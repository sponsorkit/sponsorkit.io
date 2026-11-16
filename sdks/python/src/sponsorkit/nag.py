"""The nag helper (SPEC §7.5): decide when to show a gentle "please support" message."""

from __future__ import annotations

import asyncio
import re
from collections.abc import Callable
from datetime import timedelta
from typing import TYPE_CHECKING

from .errors import SponsorkitError
from .models import ContributionResult

if TYPE_CHECKING:
    from .client import Sponsorkit

__all__ = ["Nag", "parse_duration"]

_DURATION = re.compile(
    r"^P(?:(?P<y>\d+(?:\.\d+)?)Y)?(?:(?P<mo>\d+(?:\.\d+)?)M)?(?:(?P<w>\d+(?:\.\d+)?)W)?(?:(?P<d>\d+(?:\.\d+)?)D)?"
    r"(?:T(?:(?P<h>\d+(?:\.\d+)?)H)?(?:(?P<mi>\d+(?:\.\d+)?)M)?(?:(?P<s>\d+(?:\.\d+)?)S)?)?$"
)


def parse_duration(value: str | timedelta | float | int) -> timedelta:
    """Parse an ISO-8601 duration (``P7D``, ``PT12H``, ``P1W``…); a ``timedelta`` passes through.

    Numbers are seconds. Years count as 365 days and months as 30 days.
    Raises ``SponsorkitError("invalid_config")`` for anything else.
    """
    if isinstance(value, timedelta):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return timedelta(seconds=value)
    if isinstance(value, str):
        m = _DURATION.fullmatch(value.strip().upper())
        if m and value.strip().upper() not in ("P", "PT") and not value.strip().upper().endswith("T"):
            g = {k: float(v) if v else 0.0 for k, v in m.groupdict().items()}
            return timedelta(
                days=g["y"] * 365 + g["mo"] * 30 + g["w"] * 7 + g["d"],
                hours=g["h"],
                minutes=g["mi"],
                seconds=g["s"],
            )
    raise SponsorkitError("invalid_config", f"Invalid duration {value!r} (expected ISO-8601, e.g. P7D)")


Predicate = Callable[[ContributionResult], bool]


class Nag:
    """A named nag created by :meth:`sponsorkit.Sponsorkit.nag`.

    The run counter goes up by one per process per ``id``, on the first :meth:`due` call. ``due()``
    returns ``predicate(result) and (runs >= every or time since last shown >= or_every)``.
    :meth:`shown` resets the counter and records the time.

    ``due()`` is always ``False`` when ``SPONSORKIT_DISABLE`` is set, and (unless ``force=True``)
    when ``SPONSORKIT_NO_NAG`` or ``CI`` is set or the session is not interactive (stdout/stderr not
    a TTY, or the ``interactive=False`` option). It never signs in.
    """

    def __init__(self, sk: Sponsorkit, id: str, every: int, or_every: timedelta | None) -> None:
        self._sk = sk
        self.id = id
        self.every = every
        self.or_every = or_every

    def due(self, predicate: Predicate | None = None, *, force: bool = False) -> bool:
        """Whether to show the nag now. ``predicate`` receives the current :class:`ContributionResult`."""
        return self._sk._nag_due(self, predicate, force)

    def shown(self) -> None:
        """Record that the nag was shown: resets the run counter and sets ``lastShown`` to now."""
        self._sk._nag_shown(self)

    async def adue(self, predicate: Predicate | None = None, *, force: bool = False) -> bool:
        """Async variant of :meth:`due` (runs in a worker thread)."""
        return await asyncio.to_thread(self.due, predicate, force=force)

    async def ashown(self) -> None:
        """Async variant of :meth:`shown`."""
        await asyncio.to_thread(self.shown)
