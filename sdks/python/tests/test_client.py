"""Client behaviour beyond the conformance scenarios: clock, custom storage, hooks, errors, async."""

from __future__ import annotations

import asyncio
import json
import os
import stat
import threading
import time
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
import pytest

import sponsorkit.client as client_mod
from sponsorkit import (
    FileStorage,
    MemoryStorage,
    Sponsorkit,
    SponsorkitError,
    reset_process_state,
    verify_session,
)
from sponsorkit.server import averify_session

FIXTURES = Path(__file__).resolve().parents[2] / "conformance" / "fixtures"
RESULT: dict[str, Any] = json.loads((FIXTURES / "contribution-result.json").read_text())
HASH = "3363d36356e472dab64ce744efd4e8bad412dd7f152bfd357ba96aa97180ac0e"
T0 = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)


class Clock:
    def __init__(self, now: datetime = T0) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kw: float) -> None:
        self.now += timedelta(**kw)


class Api:
    """A tiny programmable /api/v1 fake for MockTransport."""

    def __init__(self) -> None:
        self.calls: list[httpx.Request] = []
        self.responses: list[httpx.Response | Exception] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        nxt = self.responses.pop(0) if self.responses else httpx.Response(200, json=RESULT)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt

    def client(self) -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(self.handler))


def signed_in_storage(stored_at: datetime | None = T0, token: str = "sks_test") -> MemoryStorage:
    s = MemoryStorage()
    data: dict[str, Any] = {"v": 1, "sessionToken": token}
    if stored_at is not None:
        data["cache"] = {"result": RESULT, "storedAt": stored_at.isoformat().replace("+00:00", "Z")}
    s.write(HASH, json.dumps(data))
    return s


def make(api: Api | None = None, **kw: Any) -> Sponsorkit:
    kw.setdefault("env", {})
    return Sponsorkit(
        github="sponsorkit-conformance",
        opencollective="sponsorkit-conformance",
        http_client=api.client() if api else None,
        **kw,
    )


# ---------------------------------------------------------------- configuration


@pytest.mark.parametrize(
    "kwargs",
    [
        {},
        {"github": "-bad"},
        {"github": "ok", "api_base_url": "ftp://x"},
        {"github": "ok", "sign_in_method": "fax"},
        {"github": "ok", "app_name": "x" * 65},
        {"github": "ok", "mock": "platinum"},
        {"github": "ok", "checkout_poll_interval": 0},
    ],
)
def test_invalid_config(kwargs: dict[str, Any]) -> None:
    with pytest.raises(SponsorkitError) as e:
        Sponsorkit(env={}, **kwargs)
    assert e.value.code == "invalid_config"


def test_malformed_targets_throw_even_when_disabled() -> None:
    with pytest.raises(SponsorkitError) as e:
        Sponsorkit(github="-bad-", env={"SPONSORKIT_DISABLE": "1"})
    assert e.value.code == "invalid_config"


@pytest.mark.parametrize(
    ("value", "disabled"), [("1", True), ("yes", True), ("0", False), ("FALSE", False), ("", False)]
)
def test_env_flag_semantics(value: str, disabled: bool) -> None:
    assert make(env={"SPONSORKIT_DISABLE": value}).disabled is disabled


def test_properties_and_checkout_url_validation(tmp_path: Path) -> None:
    sk = make(storage_dir=tmp_path / "s", api_base_url="http://example.test/")
    assert sk.targets == ("github:sponsorkit-conformance", "opencollective:sponsorkit-conformance")
    assert sk.targets_hash == HASH
    assert (
        sk.checkout_url()
        == f"http://example.test/checkout?targets={sk.targets_param.replace(':', '%3A').replace(',', '%2C')}"
    )
    for bad in (
        {"amount": -1},
        {"amount": 1.5},
        {"currency": "usd"},
        {"frequency": "weekly"},
        {"provider": "patreon"},
    ):
        with pytest.raises(SponsorkitError) as e:
            sk.checkout_url(**bad)
        assert e.value.code == "invalid_config"
    assert not (tmp_path / "s").exists()


def test_provider_must_be_configured(tmp_path: Path) -> None:
    sk = Sponsorkit(github="octocat", storage_dir=tmp_path, env={})
    with pytest.raises(SponsorkitError) as e:
        sk.checkout_url(provider="opencollective")
    assert e.value.code == "invalid_config"


# ---------------------------------------------------------------- cache & clock


def test_cache_ttl_uses_injected_clock() -> None:
    api, clock = Api(), Clock()
    sk = make(api, storage=signed_in_storage(), clock=clock, cache_ttl=120)
    assert sk.get_financial_contribution().from_cache
    clock.advance(seconds=119)
    assert sk.get_financial_contribution().from_cache
    assert api.calls == []
    clock.advance(seconds=2)
    r = sk.get_financial_contribution()
    assert not r.from_cache and len(api.calls) == 1
    assert api.calls[0].headers["authorization"] == "Bearer sks_test"


def test_cache_ttl_minimum_is_60_seconds() -> None:
    api, clock = Api(), Clock()
    sk = make(api, storage=signed_in_storage(), clock=clock, cache_ttl=1)
    clock.advance(seconds=30)
    assert sk.get_financial_contribution().from_cache
    assert sk.get_financial_contribution(cache_ttl=0).from_cache is False


def test_retry_after_http_date_and_reset() -> None:
    api, clock = Api(), Clock()
    when = (T0 + timedelta(seconds=120)).strftime("%a, %d %b %Y %H:%M:%S GMT")
    api.responses.append(httpx.Response(429, headers={"Retry-After": when}, json={"code": "rate_limited"}))
    sk = make(api, storage=signed_in_storage(), clock=clock)
    r = sk.get_financial_contribution(cache_ttl=0)
    assert r.from_cache and r.stale
    clock.advance(seconds=100)
    assert sk.get_financial_contribution(cache_ttl=0).from_cache
    assert len(api.calls) == 1
    clock.advance(seconds=21)
    assert not sk.get_financial_contribution(cache_ttl=0).from_cache
    assert len(api.calls) == 2


def test_retry_after_memo_is_per_process() -> None:
    api = Api()
    api.responses.append(httpx.Response(429, headers={"Retry-After": "3600"}))
    sk = make(api, storage=signed_in_storage())
    sk.get_financial_contribution(cache_ttl=0)
    sk.get_financial_contribution(cache_ttl=0)
    assert len(api.calls) == 1
    reset_process_state()
    sk.get_financial_contribution(cache_ttl=0)
    assert len(api.calls) == 2


@pytest.mark.parametrize(
    "failure",
    [
        httpx.ConnectError("refused"),
        httpx.ReadTimeout("slow"),
        httpx.Response(502, json={"code": "internal"}),
        httpx.Response(200, text="<html>not json</html>"),
        httpx.Response(200, json={"unexpected": True}),
    ],
)
def test_never_raises_for_network_or_server_problems(failure: httpx.Response | Exception) -> None:
    api = Api()
    api.responses.append(failure)
    r = make(api, storage=signed_in_storage(stored_at=None)).get_financial_contribution()
    assert r.signed_in and r.stale and not r.from_cache and r.contributions == ()


def test_session_renewal_header_replaces_token() -> None:
    api, storage = Api(), signed_in_storage()
    api.responses.append(httpx.Response(200, json=RESULT, headers={"Sponsorkit-Session": "sks_renewed"}))
    make(api, storage=storage).get_financial_contribution(cache_ttl=0)
    assert json.loads(storage.read(HASH) or "")["sessionToken"] == "sks_renewed"


def test_storage_write_failures_never_raise() -> None:
    class ReadOnly(MemoryStorage):
        def write(self, key: str, data: str) -> None:
            raise PermissionError("read-only")

    storage = ReadOnly()
    MemoryStorage.write(storage, HASH, json.dumps({"v": 1, "sessionToken": "sks_x"}))
    r = make(Api(), storage=storage).get_financial_contribution()
    assert r.signed_in and not r.from_cache


def test_session_invalid_keeps_nags() -> None:
    api, storage = Api(), MemoryStorage()
    storage.write(
        HASH, json.dumps({"v": 1, "sessionToken": "sks_x", "nags": {"n": {"runs": 2, "lastShown": None}}})
    )
    api.responses.append(httpx.Response(401, json={"code": "session_invalid"}))
    r = make(api, storage=storage).get_financial_contribution()
    assert not r.signed_in
    assert json.loads(storage.read(HASH) or "") == {"v": 1, "nags": {"n": {"runs": 2, "lastShown": None}}}


# ---------------------------------------------------------------- storage


def test_file_storage_atomic_and_private(tmp_path: Path) -> None:
    d = tmp_path / "a" / "b"
    fs = FileStorage(d)
    assert fs.read("k") is None
    fs.write("k", '{"v":1}')
    fs.write("k", '{"v":1,"x":2}')
    assert fs.read("k") == '{"v":1,"x":2}'
    assert sorted(os.listdir(d)) == ["k.json"]
    if os.name == "posix":
        assert stat.S_IMODE(os.stat(d).st_mode) == 0o700
        assert stat.S_IMODE(os.stat(d / "k.json").st_mode) == 0o600
    fs.delete("k")
    fs.delete("k")
    assert fs.read("k") is None


def test_corrupt_storage_file_is_ignored_and_unknown_keys_survive(tmp_path: Path) -> None:
    fs = FileStorage(tmp_path)
    fs.write(HASH, "{not json")
    sk = make(storage_dir=tmp_path)
    assert not sk.is_signed_in()
    fs.write(HASH, json.dumps({"v": 1, "sessionToken": "sks_x", "future": {"k": 1}}))
    assert sk.is_signed_in()
    sk.sign_out()
    assert json.loads(fs.read(HASH) or "") == {"v": 1, "future": {"k": 1}}


def test_sign_out_without_file_creates_nothing(tmp_path: Path) -> None:
    make(storage_dir=tmp_path / "s").sign_out()
    assert not (tmp_path / "s").exists()


def test_default_storage_dir_respects_xdg(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import sys

    from sponsorkit import default_storage_dir

    if sys.platform in ("win32", "darwin"):
        pytest.skip("XDG only applies on Linux/BSD")
    assert default_storage_dir({"XDG_CONFIG_HOME": str(tmp_path)}) == tmp_path / "sponsorkit"
    monkeypatch.setenv("HOME", str(tmp_path))
    assert default_storage_dir({}) == tmp_path / ".config" / "sponsorkit"


# ---------------------------------------------------------------- nag


def test_nag_tty_detection_and_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    clock = Clock()
    storage = MemoryStorage()
    sk = make(storage=storage, clock=clock)
    nag = sk.nag("n", every=5, or_every="P1D")
    monkeypatch.setattr(client_mod, "_is_tty", lambda: False)
    assert nag.due() is False
    monkeypatch.setattr(client_mod, "_is_tty", lambda: True)
    assert nag.due() is False  # 1 run, never shown
    nag.shown()
    clock.advance(hours=23)
    assert nag.due() is False
    clock.advance(hours=1)
    assert nag.due() is True
    assert make(storage=storage, clock=clock, env={"CI": "1"}).nag("n", or_every="P1D").due() is False
    assert make(storage=storage, clock=clock, env={"SPONSORKIT_NO_NAG": "true"}).nag("n").due() is False


def test_nag_validation() -> None:
    sk = make(storage=MemoryStorage())
    for kwargs in ({"every": 0}, {"every": True}, {"or_every": "soon"}):
        with pytest.raises(SponsorkitError):
            sk.nag("x", **kwargs)
    with pytest.raises(SponsorkitError):
        sk.nag("")


def test_mock_mode_nags_stay_in_memory(tmp_path: Path) -> None:
    sk = make(storage_dir=tmp_path / "s", mock="none")
    nag = sk.nag("n", every=1)
    assert nag.due(force=True) is True
    nag.shown()
    assert not (tmp_path / "s").exists()


def test_disabled_does_nothing(tmp_path: Path) -> None:
    sk = make(storage_dir=tmp_path / "s", env={"SPONSORKIT_DISABLE": "1"})
    assert sk.nag("n", every=1).due(force=True) is False
    sk.nag("n").shown()
    sk.sign_out()
    with pytest.raises(SponsorkitError) as e:
        sk.open_checkout()
    assert e.value.code == "disabled"
    assert sk.checkout_url(frequency="monthly").startswith("https://sponsorkit.io/checkout?")
    assert not (tmp_path / "s").exists()


# ---------------------------------------------------------------- sign-in (fake server)


@pytest.fixture
def fake(conformance_server: str) -> Callable[..., Any]:
    http = httpx.Client(trust_env=False)
    http.post(f"{conformance_server}/__control/reset")
    http.post(f"{conformance_server}/__control", json={})

    def call(method: str, path: str, body: Any = None) -> Any:
        return http.request(method, f"{conformance_server}{path}", json=body).json()

    return call


def _paste_prompt(url: str) -> str:
    with httpx.Client(trust_env=False, follow_redirects=True) as c:
        return c.get(url).headers["sponsorkit-conformance-code"]


def test_auto_uses_paste_over_ssh(
    fake: Callable[..., Any],
    conformance_server: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("SSH_CONNECTION", "10.0.0.1 1 10.0.0.2 22")
    seen: list[str] = []

    def prompt(url: str) -> str:
        seen.append(url)
        return _paste_prompt(url)

    sk = make(api_base_url=conformance_server, storage_dir=tmp_path, prompt_for_code=prompt)
    result = sk.sign_in()
    assert result.signed_in and sk.is_signed_in()
    assert "delivery=paste" in seen[0]
    assert seen[0] in capsys.readouterr().err


def test_auto_falls_back_to_paste_when_browser_fails(
    fake: Callable[..., Any],
    conformance_server: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SSH_CONNECTION", raising=False)
    monkeypatch.delenv("SSH_TTY", raising=False)
    monkeypatch.setenv("DISPLAY", ":0")
    opened: list[str] = []

    def no_browser(url: str) -> bool:
        opened.append(url)
        return False

    monkeypatch.setattr(client_mod, "_default_open_browser", no_browser)
    sk = make(api_base_url=conformance_server, storage_dir=tmp_path, prompt_for_code=_paste_prompt)
    sk.sign_in()
    assert "delivery=loopback" in opened[0]
    assert sk.is_signed_in()


def test_sign_in_timeout_and_cancel(
    fake: Callable[..., Any], conformance_server: str, tmp_path: Path
) -> None:
    sk = make(api_base_url=conformance_server, storage_dir=tmp_path, open_browser=lambda url: None)
    started = time.monotonic()
    with pytest.raises(SponsorkitError) as e:
        sk.sign_in(method="loopback", timeout=0.3)
    assert e.value.code == "timeout" and time.monotonic() - started < 5
    cancel = threading.Event()
    threading.Timer(0.2, cancel.set).start()
    with pytest.raises(SponsorkitError) as e:
        sk.sign_in(method="loopback", cancel=cancel)
    assert e.value.code == "cancelled"
    assert not sk.is_signed_in()


def test_invalid_code_is_reported(fake: Callable[..., Any], conformance_server: str, tmp_path: Path) -> None:
    sk = make(
        api_base_url=conformance_server,
        storage_dir=tmp_path,
        sign_in_method="paste",
        prompt_for_code=lambda url: "skc_bogus",
    )
    with pytest.raises(SponsorkitError) as e:
        sk.sign_in()
    assert e.value.code == "invalid_code"


def test_adding_identity_to_a_dead_session_starts_fresh(
    fake: Callable[..., Any], conformance_server: str, tmp_path: Path
) -> None:
    storage = MemoryStorage()
    storage.write(HASH, json.dumps({"v": 1, "sessionToken": "sks_dead"}))
    sk = make(
        api_base_url=conformance_server,
        storage=storage,
        sign_in_method="paste",
        prompt_for_code=_paste_prompt,
    )
    sk.sign_in("opencollective")
    token = json.loads(storage.read(HASH) or "")["sessionToken"]
    assert token == fake("GET", "/__control")["lastSessionToken"]


def test_sign_in_network_error(tmp_path: Path) -> None:
    api = Api()
    api.responses.append(httpx.ConnectError("refused"))
    sk = make(api, storage=MemoryStorage(), sign_in_method="paste", prompt_for_code=lambda url: "skc_x")
    with pytest.raises(SponsorkitError) as e:
        sk.sign_in()
    assert e.value.code == "network_error"


async def test_async_checkout_task_cancellation(
    fake: Callable[..., Any], conformance_server: str, tmp_path: Path
) -> None:
    sk = make(
        api_base_url=conformance_server,
        storage_dir=tmp_path,
        sign_in_method="paste",
        prompt_for_code=_paste_prompt,
    )
    await sk.asign_in()
    task = asyncio.create_task(sk.aopen_checkout(provider="github", poll_interval=0.2, timeout=60))
    await asyncio.sleep(0.6)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await asyncio.sleep(0.3)
    before = fake("GET", "/__control")["contributionsCalls"]
    await asyncio.sleep(0.6)
    assert fake("GET", "/__control")["contributionsCalls"] == before


async def test_async_checkout_with_threading_event(
    fake: Callable[..., Any], conformance_server: str, tmp_path: Path
) -> None:
    sk = make(
        api_base_url=conformance_server,
        storage_dir=tmp_path,
        sign_in_method="paste",
        prompt_for_code=_paste_prompt,
    )
    await sk.asign_in()
    cancel = threading.Event()
    asyncio.get_running_loop().call_later(0.3, cancel.set)
    r = await sk.aopen_checkout(provider="github", poll_interval=0.1, cancel=cancel)
    assert r.status == "unknown" and r.contribution is None and r.to_dict() == {"status": "unknown"}


# ---------------------------------------------------------------- verify_session


def test_verify_session_errors() -> None:
    with pytest.raises(SponsorkitError) as e:
        verify_session("sks_x", {"github": "-bad"})
    assert e.value.code == "invalid_config"
    with pytest.raises(SponsorkitError) as e:
        verify_session("", {"github": "ok"})
    assert e.value.code == "session_invalid"
    cases: list[tuple[httpx.Response | Exception, str]] = [
        (httpx.ConnectError("down"), "network_error"),
        (httpx.Response(503, json={"code": "internal"}), "internal"),
        (httpx.Response(429, headers={"Retry-After": "5"}), "internal"),
        (
            httpx.Response(401, json={"code": "session_invalid"}, headers={"Sponsorkit-Request-Id": "r1"}),
            "session_invalid",
        ),
        (httpx.Response(200, json={**RESULT, "targets": ["github:other"]}), "targets_mismatch"),
    ]
    for response, code in cases:
        api = Api()
        api.responses.append(response)
        with pytest.raises(SponsorkitError) as e:
            verify_session(
                "sks_x",
                "github:sponsorkit-conformance,opencollective:sponsorkit-conformance",
                http_client=api.client(),
            )
        assert e.value.code == code


async def test_averify_session_with_client() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer sks_ok"
        return httpx.Response(200, json=RESULT)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        r = await averify_session(
            "sks_ok",
            ["opencollective:sponsorkit-conformance", "github:sponsorkit-conformance"],
            http_client=client,
        )
    assert r.signed_in and len(r.contributions) == 3
