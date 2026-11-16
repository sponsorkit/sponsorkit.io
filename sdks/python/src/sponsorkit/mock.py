"""Mock mode (SPEC §7.4).

The presets are embedded byte-for-byte from the conformance kit's ``fixtures/mock-presets.json``
(shipped as ``sponsorkit/mock_presets.json``) and expanded with the rules listed in that file.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from functools import lru_cache
from importlib import resources
from typing import Any, Literal, cast

from .errors import SponsorkitError
from .models import Contribution, ContributionResult, Frequency, Supporter
from .targets import Target

__all__ = ["MOCK_PRESET_NAMES", "MockData", "MockPreset", "mock_checkout_contribution", "mock_result"]

MockPreset = Literal["signed-out", "none", "active-monthly", "one-time", "cancelled", "org"]
"""A mock preset name."""

MOCK_PRESET_NAMES: tuple[str, ...] = ("signed-out", "none", "active-monthly", "one-time", "cancelled", "org")


@dataclass(frozen=True)
class MockData:
    """Custom mock data: the SDK reports a signed-in supporter with exactly these contributions."""

    contributions: tuple[Contribution, ...]


@lru_cache(maxsize=1)
def presets_file() -> dict[str, Any]:
    """The embedded ``mock_presets.json``."""
    text = resources.files("sponsorkit").joinpath("mock_presets.json").read_text(encoding="utf-8")
    return cast("dict[str, Any]", json.loads(text))


def _expand(template: Any, first: Target) -> Any:
    if isinstance(template, str):
        return template.replace("{provider}", first.provider).replace("{target}", str(first))
    if isinstance(template, list):
        return [_expand(v, first) for v in template]
    if isinstance(template, dict):
        return {k: _expand(v, first) for k, v in template.items()}
    return template


def parse_mock_option(value: object) -> MockPreset | MockData:
    """Validate the ``mock`` option. Raises ``SponsorkitError("invalid_config")``."""
    if isinstance(value, MockData):
        return value
    if isinstance(value, str):
        if value not in MOCK_PRESET_NAMES:
            raise SponsorkitError(
                "invalid_config",
                f'Unknown mock preset "{value}" (expected one of {", ".join(MOCK_PRESET_NAMES)})',
            )
        return cast(MockPreset, value)
    if isinstance(value, Mapping) and "contributions" in value:
        items = value["contributions"]
        if isinstance(items, Sequence) and not isinstance(items, (str, bytes)):
            try:
                return MockData(
                    tuple(c if isinstance(c, Contribution) else Contribution.from_dict(c) for c in items)
                )
            except (KeyError, TypeError, ValueError) as e:
                raise SponsorkitError("invalid_config", f"Invalid mock contribution: {e}") from e
    raise SponsorkitError("invalid_config", 'mock must be a preset name or {"contributions": [...]}')


def _supporter(first: Target) -> Supporter:
    return Supporter.from_dict(_expand(presets_file()["supporter"], first))


def mock_result(targets: Sequence[Target], mock: MockPreset | MockData) -> ContributionResult:
    """The result mock mode returns for a canonical target set."""
    first = targets[0]
    common: dict[str, Any] = {
        "disabled": False,
        "mock": True,
        "targets": tuple(str(t) for t in targets),
        "fetched_at": None,
        "stale": False,
        "from_cache": False,
    }
    if isinstance(mock, MockData):
        return ContributionResult(
            signed_in=True, supporter=_supporter(first), contributions=mock.contributions, **common
        )
    preset = presets_file()["presets"][mock]
    signed_in = bool(preset["signedIn"])
    return ContributionResult(
        signed_in=signed_in,
        supporter=_supporter(first) if signed_in else None,
        contributions=tuple(Contribution.from_dict(_expand(c, first)) for c in preset["contributions"]),
        **common,
    )


def mock_checkout_contribution(
    targets: Sequence[Target],
    *,
    provider: str | None = None,
    amount: int | None = None,
    currency: str | None = None,
    frequency: Frequency | None = None,
) -> Contribution:
    """The contribution ``open_checkout()`` simulates in mock mode."""
    first = next((t for t in targets if t.provider == provider), targets[0])
    freq = frequency or "monthly"
    one_time = freq == "one_time"
    data = _expand(presets_file()["checkout"], first)
    data.update(
        amount={"value": 500 if amount is None else amount, "currency": currency or "USD"},
        frequency=freq,
        kind="one_time" if one_time else "recurring",
        status="paid" if one_time else "active",
    )
    return Contribution.from_dict(data)
