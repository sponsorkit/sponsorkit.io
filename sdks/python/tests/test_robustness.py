"""Regression tests for PROTOCOL §7.0 (robustness rules shared by all SDKs)."""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

import sponsorkit.client as client_mod
from sponsorkit import FileStorage, MemoryStorage, SponsorkitError, default_storage_dir
from sponsorkit._loopback import LoopbackReceiver
from sponsorkit.server import averify_session, verify_session

from .test_client import HASH, RESULT, Api, _run_gated, make, signed_in_storage

TOKEN_RESPONSE: dict[str, Any] = {"sessionToken": "sks_fresh", "result": RESULT}


def _timeouts(request: httpx.Request) -> dict[str, float | None]:
    return dict(request.extensions["timeout"])


# ---------------------------------------------------------------- request timeout


def test_request_timeout_defaults_to_30_seconds_on_every_request() -> None:
    api = Api()
    api.responses += [
        httpx.Response(200, json={"targets": []}),
        httpx.Response(200, json=RESULT),
        httpx.Response(200, json=TOKEN_RESPONSE),
    ]
    sk = make(api, storage=signed_in_storage(stored_at=None), dev_checks=True)
    sk.get_financial_contribution()
    sk2 = make(api, storage=MemoryStorage(), sign_in_method="paste", prompt_for_code=lambda url: "skc_x")
    sk2.sign_in()
    assert [r.url.path for r in api.calls] == [
        "/api/v1/targets",
        "/api/v1/contributions",
        "/api/v1/auth/token",
    ]
    for r in api.calls:
        assert _timeouts(r) == {"connect": 30.0, "read": 30.0, "write": 30.0, "pool": 30.0}


def test_request_timeout_option_and_zero_disables() -> None:
    api = Api()
    make(api, storage=signed_in_storage(stored_at=None), request_timeout=2.5).get_financial_contribution()
    make(api, storage=signed_in_storage(stored_at=None), request_timeout=0).get_financial_contribution()
    assert _timeouts(api.calls[0])["read"] == 2.5
    assert _timeouts(api.calls[1])["read"] is None


def test_default_http_client_uses_request_timeout() -> None:
    sk = make(request_timeout=7)
    assert sk._client().timeout.read == 7.0
    sk.close()


@pytest.mark.parametrize("value", [-1, float("nan"), float("inf"), "30", True])
def test_request_timeout_must_be_a_non_negative_number(value: Any) -> None:
    with pytest.raises(SponsorkitError) as e:
        make(request_timeout=value)
    assert e.value.code == "invalid_config"
    with pytest.raises(SponsorkitError) as e:
        verify_session("sks_x", {"github": "octocat"}, request_timeout=value)
    assert e.value.code == "invalid_config"


def test_timeout_serves_stale_cache_and_sign_in_raises_network_error() -> None:
    api = Api()
    api.responses += [httpx.ReadTimeout("slow"), httpx.ReadTimeout("slow")]
    r = make(api, storage=signed_in_storage(stored_at=None)).get_financial_contribution()
    assert r.signed_in and r.stale and r.contributions == ()
    sk = make(api, storage=MemoryStorage(), sign_in_method="paste", prompt_for_code=lambda url: "skc_x")
    with pytest.raises(SponsorkitError) as e:
        sk.sign_in()
    assert e.value.code == "network_error"


def test_verify_session_request_timeout() -> None:
    api = Api()
    verify_session("sks_x", RESULT["targets"], http_client=api.client())
    verify_session("sks_x", RESULT["targets"], http_client=api.client(), request_timeout=4)
    assert _timeouts(api.calls[0])["read"] == 30.0
    assert _timeouts(api.calls[1])["read"] == 4.0
    api.responses.append(httpx.ReadTimeout("slow"))
    with pytest.raises(SponsorkitError) as e:
        verify_session("sks_x", RESULT["targets"], http_client=api.client())
    assert e.value.code == "network_error"


async def test_averify_session_request_timeout() -> None:
    seen: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=RESULT)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        await averify_session("sks_x", RESULT["targets"], http_client=c)
        await averify_session("sks_x", RESULT["targets"], http_client=c, request_timeout=0)
    assert _timeouts(seen[0])["read"] == 30.0
    assert _timeouts(seen[1])["read"] is None


# ---------------------------------------------------------------- loopback receiver


def test_bare_callback_gets_400_and_the_receiver_keeps_waiting() -> None:
    receiver = LoopbackReceiver()
    try:
        with httpx.Client(trust_env=False) as c:
            assert c.get(receiver.redirect_uri).status_code == 400
            assert c.get(f"{receiver.redirect_uri}?code=&error=").status_code == 400
            assert c.get(f"{receiver.redirect_uri}?state=x").status_code == 400
            assert receiver.outcome is None
            assert c.get(f"{receiver.redirect_uri}?code=skc_ok").status_code == 200
        outcome = receiver.wait(time.monotonic() + 5, None)
        assert (outcome.kind, outcome.value) == ("code", "skc_ok")
    finally:
        receiver.close()


def _callback(url: str, query: str) -> None:
    redirect = parse_qs(urlsplit(url).query)["redirect_uri"][0]
    with httpx.Client(trust_env=False) as c:
        c.get(f"{redirect}?{query}")


def test_loopback_bind_failure_falls_back_to_paste_in_auto(monkeypatch: pytest.MonkeyPatch) -> None:
    def no_bind(*args: Any, **kw: Any) -> LoopbackReceiver:
        raise OSError(99, "Cannot assign requested address")

    monkeypatch.setattr(client_mod, "LoopbackReceiver", no_bind)
    api = Api()
    api.responses.append(httpx.Response(200, json=TOKEN_RESPONSE))
    prompted: list[str] = []
    opened: list[str] = []

    def prompt(url: str) -> str:
        prompted.append(url)
        return "skc_pasted"

    sk = make(api, storage=MemoryStorage(), open_browser=opened.append, prompt_for_code=prompt)
    assert sk.sign_in().signed_in
    assert "delivery=paste" in prompted[0] and opened == []
    assert json.loads(api.calls[0].content)["code"] == "skc_pasted"
    with pytest.raises(SponsorkitError) as e:
        make(Api(), storage=MemoryStorage(), open_browser=opened.append).sign_in(method="loopback")
    assert e.value.code == "provider_error"


def test_callback_is_accepted_while_open_browser_is_still_running() -> None:
    api = Api()
    api.responses.append(httpx.Response(200, json=TOKEN_RESPONSE))
    release = threading.Event()

    def slow_opener(url: str) -> bool:
        _callback(url, "code=skc_early")
        release.wait(10)  # the opener has not returned yet
        return True

    sk = make(api, storage=MemoryStorage(), open_browser=slow_opener, sign_in_timeout=8)
    started = time.monotonic()
    try:
        assert sk.sign_in().signed_in
    finally:
        release.set()
    assert time.monotonic() - started < 5
    assert json.loads(api.calls[0].content)["code"] == "skc_early"


def test_opener_failure_after_a_while_still_falls_back_in_auto() -> None:
    api = Api()
    api.responses.append(httpx.Response(200, json=TOKEN_RESPONSE))

    def failing(url: str) -> bool:
        time.sleep(0.2)
        return False

    sk = make(api, storage=MemoryStorage(), open_browser=failing, prompt_for_code=lambda url: "skc_p")
    assert sk.sign_in().signed_in
    assert json.loads(api.calls[0].content)["code"] == "skc_p"


def test_system_launcher_exit_status_and_grace_period() -> None:
    py = sys.executable
    assert client_mod._launch([py, "-c", "raise SystemExit(0)"]) is True
    assert client_mod._launch([py, "-c", "raise SystemExit(3)"]) is False
    assert client_mod._launch([str(Path("/nonexistent/opener")), "https://x"]) is False
    started = time.monotonic()
    assert client_mod._launch([py, "-c", "import time; time.sleep(3)"], grace=0.3) is True
    assert time.monotonic() - started < 2
    assert client_mod.BROWSER_LAUNCH_GRACE == 1.5


def test_default_opener_uses_the_launcher_exit_status(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BROWSER", raising=False)
    calls: list[list[str]] = []

    def fake_launch(argv: list[str], grace: float = 1.5) -> bool:
        calls.append(argv)
        return False  # e.g. xdg-open exits 3: no browser

    monkeypatch.setattr(client_mod, "_launch", fake_launch)
    monkeypatch.setattr(client_mod, "_launcher_argv", lambda url: ["xdg-open", url])
    assert (
        client_mod._default_open_browser("https://sponsorkit.github.io/sponsorkit.io/connect/?x=1") is False
    )
    assert calls == [["xdg-open", "https://sponsorkit.github.io/sponsorkit.io/connect/?x=1"]]
    assert client_mod._default_open_browser("file:///etc/passwd") is False
    assert len(calls) == 1


# ---------------------------------------------------------------- storage reads


def _doc(**over: Any) -> str:
    base: dict[str, Any] = {
        "v": 1,
        "sessionToken": "sks_x",
        "cache": {"result": RESULT, "storedAt": "2026-11-16T12:00:00.000Z"},
    }
    base.update(over)
    return json.dumps(base)


MALFORMED: list[str] = [
    "",
    "null",
    "[]",
    '"v"',
    "{",
    "[" * 100_000,
    json.dumps({"v": "1", "sessionToken": "sks_x"}),
    _doc(sessionToken=123),
    _doc(sessionToken="sks_"),
    _doc(sessionToken="sks_é"),
    _doc(sessionToken="sks_a b"),
    _doc(cache=None),
    _doc(cache=[]),
    _doc(cache={"result": None, "storedAt": "2026-11-16T12:00:00Z"}),
    _doc(cache={"result": RESULT, "storedAt": "yesterday"}),
    _doc(cache={"result": RESULT, "storedAt": None}),
    _doc(cache={"result": {**RESULT, "contributions": None}, "storedAt": "2026-11-16T12:00:00Z"}),
    _doc(cache={"result": {**RESULT, "contributions": [1, "x"]}, "storedAt": "2026-11-16T12:00:00Z"}),
    _doc(cache={"result": {**RESULT, "targets": None}, "storedAt": "2026-11-16T12:00:00Z"}),
    _doc(nags=None),
    _doc(nags=[]),
    _doc(nags={"n": None, "m": {"runs": "3", "lastShown": "not a date"}, "o": {"runs": -1, "lastShown": 5}}),
    '{"v": 1, "sessionToken": "sks_x", "n": ' + "9" * 5000 + "}",
]


@pytest.mark.parametrize("text", MALFORMED)
def test_storage_reads_never_throw(text: str) -> None:
    storage = MemoryStorage()
    storage.write(HASH, text)
    sk = make(Api(), storage=storage)
    sk.is_signed_in()
    sk.get_financial_contribution()
    nag = sk.nag("n", every=100, or_every="P1D")
    nag.due(force=True)


def test_bad_dates_in_storage_count_as_absent() -> None:
    storage = MemoryStorage()
    storage.write(
        HASH,
        _doc(
            cache={"result": RESULT, "storedAt": "yesterday"},
            nags={"n": {"runs": 1, "lastShown": "not a date"}},
        ),
    )
    api = Api()
    sk = make(api, storage=storage)
    assert not sk.get_financial_contribution().from_cache
    assert len(api.calls) == 1
    assert sk.nag("n", every=100, or_every="P1D").due(force=True) is False


def test_invalid_utf8_and_raising_storage_read_count_as_absent(tmp_path: Path) -> None:
    (tmp_path / f"{HASH}.json").write_bytes(b'{"v":1,"sessionToken":"sks_\xff"}')
    assert not make(storage_dir=tmp_path).is_signed_in()

    class Broken(MemoryStorage):
        def read(self, key: str) -> str | None:
            raise RuntimeError("keychain locked")

    sk = make(Api(), storage=Broken())
    assert not sk.is_signed_in()
    assert not sk.get_financial_contribution().signed_in


@pytest.mark.parametrize("fraction", ["", ".1", ".12", ".1234", ".1234567", ".123456789"])
def test_stored_at_with_any_fraction_length_is_fresh(fraction: str) -> None:
    storage = MemoryStorage()
    storage.write(HASH, _doc(cache={"result": RESULT, "storedAt": f"2026-11-16T11:59:00{fraction}Z"}))
    api = Api()
    from .test_client import Clock

    r = make(api, storage=storage, clock=Clock()).get_financial_contribution()
    assert r.from_cache and api.calls == []


# ---------------------------------------------------------------- storage writes


class _FailingWrites(MemoryStorage):
    def __init__(self, exc: Exception) -> None:
        super().__init__()
        self.exc = exc

    def write(self, key: str, data: str) -> None:
        raise self.exc

    def delete(self, key: str) -> None:
        raise self.exc


@pytest.mark.parametrize("exc", [PermissionError("read-only"), RuntimeError("keychain")])
def test_sign_in_write_failure_is_invalid_config(exc: Exception) -> None:
    api = Api()
    api.responses.append(httpx.Response(200, json=TOKEN_RESPONSE))
    sk = make(api, storage=_FailingWrites(exc), sign_in_method="paste", prompt_for_code=lambda url: "skc_x")
    with pytest.raises(SponsorkitError) as e:
        sk.sign_in()
    assert e.value.code == "invalid_config"


@pytest.mark.parametrize("extra", [{}, {"nags": {"n": {"runs": 1, "lastShown": None}}}])
@pytest.mark.parametrize("exc", [PermissionError("read-only"), RuntimeError("keychain")])
def test_sign_out_write_failure_is_invalid_config(exc: Exception, extra: dict[str, Any]) -> None:
    storage = _FailingWrites(exc)
    MemoryStorage.write(storage, HASH, json.dumps({"v": 1, "sessionToken": "sks_x", **extra}))
    with pytest.raises(SponsorkitError) as e:
        make(storage=storage).sign_out()
    assert e.value.code == "invalid_config"


def test_sign_out_on_a_read_only_directory_is_invalid_config(tmp_path: Path) -> None:
    if os.name != "posix" or os.geteuid() == 0:
        pytest.skip("needs POSIX permissions enforced for this user")
    FileStorage(tmp_path).write(HASH, json.dumps({"v": 1, "sessionToken": "sks_x"}))
    os.chmod(tmp_path, 0o500)
    try:
        with pytest.raises(SponsorkitError) as e:
            make(storage_dir=tmp_path).sign_out()
        assert e.value.code == "invalid_config"
    finally:
        os.chmod(tmp_path, 0o700)


def test_refresh_writes_back_only_while_the_token_is_unchanged() -> None:
    # Another refresh of the same token already renewed it: this response must not be written.
    storage = signed_in_storage(stored_at=None, token="sks_old")

    def renewed_elsewhere() -> None:
        storage.write(HASH, json.dumps({"v": 1, "sessionToken": "sks_renewed"}))

    _run_gated(
        storage,
        httpx.Response(200, json=RESULT, headers={"Sponsorkit-Session": "sks_renewed"}),
        renewed_elsewhere,
    )
    assert json.loads(storage.read(HASH) or "") == {"v": 1, "sessionToken": "sks_renewed"}


# ---------------------------------------------------------------- no config directory


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX environment variables")
def test_default_storage_dir_is_none_without_an_absolute_home() -> None:
    assert default_storage_dir({}) is None
    assert default_storage_dir({"HOME": ""}) is None
    assert default_storage_dir({"HOME": "relative/home"}) is None
    if sys.platform != "darwin":
        assert default_storage_dir({"XDG_CONFIG_HOME": "rel"}) is None
        assert default_storage_dir({"XDG_CONFIG_HOME": "rel", "HOME": "/h"}) == Path("/h/.config/sponsorkit")


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX environment variables")
def test_no_config_dir_falls_back_to_memory_never_cwd(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("HOME", raising=False)
    monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
    monkeypatch.chdir(tmp_path)
    api = Api()
    api.responses.append(httpx.Response(200, json=TOKEN_RESPONSE))
    sk = make(api, sign_in_method="paste", prompt_for_code=lambda url: "skc_x")
    assert sk.sign_in().signed_in
    assert sk.is_signed_in()
    sk.nag("n", every=1).due(force=True)
    sk.sign_out()
    assert list(tmp_path.iterdir()) == []
