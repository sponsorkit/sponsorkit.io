"""Data-driven conformance suite: one test per scenario in sdks/conformance/scenarios.json.

``test_conformance[<id>]`` drives the sync API; ``test_conformance_async[<id>]`` drives the ``a*``
coroutine variants and :func:`sponsorkit.server.averify_session`.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from .conformance.runner import AsyncAdapter, SyncAdapter, load_scenarios, run_scenario

SCENARIOS_FILE = load_scenarios()
SCENARIOS: list[dict[str, Any]] = SCENARIOS_FILE["scenarios"]
IDS = [s["id"] for s in SCENARIOS]


def test_scenario_ids_are_unique() -> None:
    assert len(IDS) == len(set(IDS))


@pytest.mark.parametrize("scenario", SCENARIOS, ids=IDS)
def test_conformance(scenario: dict[str, Any], conformance_server: str, tmp_path: Path) -> None:
    run_scenario(
        scenario,
        SyncAdapter(),
        base_url=conformance_server,
        variables=SCENARIOS_FILE["variables"],
        storage_root=tmp_path,
    )


@pytest.mark.parametrize("scenario", SCENARIOS, ids=IDS)
def test_conformance_async(scenario: dict[str, Any], conformance_server: str, tmp_path: Path) -> None:
    run_scenario(
        scenario,
        AsyncAdapter(),
        base_url=conformance_server,
        variables=SCENARIOS_FILE["variables"],
        storage_root=tmp_path,
    )
