"""Unit tests against the conformance kit's fixtures and test vectors."""

from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest

from sponsorkit import (
    MOCK_PRESET_NAMES,
    ContributionResult,
    MockData,
    SponsorkitError,
    parse_duration,
)
from sponsorkit.mock import mock_checkout_contribution, mock_result, parse_mock_option, presets_file
from sponsorkit.pkce import code_challenge, generate_code_verifier
from sponsorkit.targets import (
    Target,
    coerce_targets,
    normalize_target,
    targets_from_options,
    targets_from_param,
    targets_hash,
    targets_param,
)

FIXTURES = Path(__file__).resolve().parents[2] / "conformance" / "fixtures"
PACKAGE = Path(__file__).resolve().parents[1] / "src" / "sponsorkit"


def fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


VECTORS = fixture("vectors.json")


@pytest.mark.parametrize("vector", VECTORS["targetSets"], ids=lambda v: v["param"])
def test_targets_hash_vectors(vector: dict[str, Any]) -> None:
    targets = targets_from_options(vector["input"].get("github"), vector["input"].get("opencollective"))
    assert targets_param(targets) == vector["param"]
    assert targets_hash(targets) == vector["targetsHash"]
    assert targets_from_param(vector["param"]) == targets
    assert coerce_targets(vector["input"]) == targets


@pytest.mark.parametrize("vector", VECTORS["invalidTargets"], ids=lambda v: f"{v['provider']}:{v['account']}")
def test_invalid_targets(vector: dict[str, str]) -> None:
    with pytest.raises(SponsorkitError) as e:
        normalize_target(vector["provider"], vector["account"])
    assert e.value.code == "invalid_config"


def test_target_set_rules() -> None:
    with pytest.raises(SponsorkitError):
        targets_from_options()
    with pytest.raises(SponsorkitError):
        coerce_targets(["github:a", "github:b"])
    with pytest.raises(SponsorkitError):
        coerce_targets({"patreon": "x"})
    assert coerce_targets(["opencollective:B", "github:A", "github:a"]) == (
        Target("github", "a"),
        Target("opencollective", "b"),
    )
    assert str(Target("github", "octocat")) == "github:octocat"


@pytest.mark.parametrize("vector", VECTORS["pkce"], ids=lambda v: v["codeChallenge"])
def test_pkce_vectors(vector: dict[str, str]) -> None:
    assert code_challenge(vector["codeVerifier"]) == vector["codeChallenge"]


def test_generated_verifier_shape() -> None:
    import re

    verifiers = {generate_code_verifier() for _ in range(50)}
    assert len(verifiers) == 50
    for v in verifiers:
        assert re.fullmatch(r"[A-Za-z0-9_-]{43}", v)
        assert re.fullmatch(r"[A-Za-z0-9_-]{43}", code_challenge(v))


# ---------------------------------------------------------------- mock presets


def test_embedded_presets_are_identical_to_the_kit() -> None:
    assert (PACKAGE / "mock_presets.json").read_bytes() == (FIXTURES / "mock-presets.json").read_bytes()
    assert presets_file() == fixture("mock-presets.json")
    assert tuple(presets_file()["presets"]) == MOCK_PRESET_NAMES


@pytest.mark.parametrize("name", MOCK_PRESET_NAMES)
def test_mock_presets_expand_for_the_first_canonical_target(name: str) -> None:
    targets = targets_from_options("octocat", "my-collective")
    r = mock_result(targets, parse_mock_option(name))
    assert r.mock and not r.disabled and not r.stale and not r.from_cache and r.fetched_at is None
    assert r.targets == ("github:octocat", "opencollective:my-collective")
    assert r.signed_in == (name != "signed-out")
    assert (r.supporter is not None) == r.signed_in
    for c in r.contributions:
        assert c.provider == "github"
        assert c.target == "github:octocat"
        assert c.id.startswith("con_github_mock_")
    assert "unavailable" not in r.to_dict()


def test_mock_preset_with_opencollective_only() -> None:
    r = mock_result(targets_from_options(opencollective="Coll"), "org")
    assert r.contributions[0].id == "con_opencollective_mock_org"
    assert r.contributions[0].target == "opencollective:coll"
    assert r.contributions[0].via == "organization"
    assert r.supporter is not None and r.supporter.identities[0].provider == "opencollective"


def test_mock_checkout_contribution_rules() -> None:
    targets = targets_from_options("octocat", "coll")
    c = mock_checkout_contribution(targets)
    assert (c.provider, c.amount.value, c.amount.currency, c.frequency, c.kind, c.status) == (
        "github",
        500,
        "USD",
        "monthly",
        "recurring",
        "active",
    )
    c = mock_checkout_contribution(
        targets, provider="opencollective", amount=1500, currency="EUR", frequency="one_time"
    )
    assert c.id == "con_opencollective_mock_checkout"
    assert (c.amount.value, c.amount.currency, c.kind, c.status) == (1500, "EUR", "one_time", "paid")


def test_invalid_mock_values() -> None:
    bad_values: list[object] = ["platinum", 3, {"contributions": [{"id": "x"}]}, {"nope": []}]
    for bad in bad_values:
        with pytest.raises(SponsorkitError) as e:
            parse_mock_option(bad)
        assert e.value.code == "invalid_config"
    data = parse_mock_option({"contributions": fixture("contribution-result.json")["contributions"]})
    assert isinstance(data, MockData) and len(data.contributions) == 3


# ---------------------------------------------------------------- models


@pytest.mark.parametrize(
    "name",
    [
        "contribution-result.json",
        "contribution-result.partial.json",
        "contribution-result.signed-out.json",
        "contribution-result.disabled.json",
    ],
)
def test_result_fixtures_round_trip(name: str) -> None:
    data = fixture(name)
    assert ContributionResult.from_dict(data).to_dict() == data


def test_token_response_and_storage_fixtures_parse() -> None:
    token = fixture("token-response.json")
    assert ContributionResult.from_dict(token["result"]).to_dict() == token["result"]
    storage = fixture("storage-file.json")
    assert ContributionResult.from_dict(storage["cache"]["result"]).to_dict() == storage["cache"]["result"]


def test_result_helpers() -> None:
    r = ContributionResult.from_dict(fixture("contribution-result.json"))
    ids = {c.id: c for c in r.contributions}
    assert {c.id for c in r.active()} == {c.id for c in r.contributions if c.status == "active"}
    assert all(c.kind == "recurring" for c in r.recurring())
    assert all(c.kind == "one_time" for c in r.one_time())
    assert len(r.recurring()) + len(r.one_time()) == len(ids)
    assert all(c.provider == "github" for c in r.by_provider("github"))
    assert all(c.via == "direct" for c in r.direct())
    assert len(r.by_provider("github")) + len(r.by_provider("opencollective")) == len(ids)


def test_unknown_status_maps_to_pending() -> None:
    data = fixture("contribution-result.json")
    data["contributions"][0]["status"] = "something_new"
    r = ContributionResult.from_dict(data)
    assert r.contributions[0].status == "pending"


def test_malformed_result_raises() -> None:
    data = fixture("contribution-result.json")
    del data["signedIn"]
    with pytest.raises(KeyError):
        ContributionResult.from_dict(data)
    with pytest.raises(TypeError):
        ContributionResult.from_dict({**fixture("contribution-result.json"), "contributions": "x"})


# ---------------------------------------------------------------- durations


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("P7D", timedelta(days=7)),
        ("PT2S", timedelta(seconds=2)),
        ("PT1.5S", timedelta(seconds=1.5)),
        ("P1W", timedelta(days=7)),
        ("P1DT12H", timedelta(days=1, hours=12)),
        ("PT30M", timedelta(minutes=30)),
        ("P1M", timedelta(days=30)),
        ("P1Y", timedelta(days=365)),
    ],
)
def test_parse_duration(text: str, expected: timedelta) -> None:
    assert parse_duration(text) == expected


def test_parse_duration_passthrough_and_errors() -> None:
    assert parse_duration(timedelta(hours=1)) == timedelta(hours=1)
    assert parse_duration(90) == timedelta(seconds=90)
    for bad in ("P", "PT", "7D", "P1DT", "", "soon"):
        with pytest.raises(SponsorkitError):
            parse_duration(bad)
