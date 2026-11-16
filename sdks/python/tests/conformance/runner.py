"""Python port of sdks/conformance/src/runner.ts: runs one scenarios.json scenario against the SDK."""

from __future__ import annotations

import asyncio
import fnmatch
import json
import os
import stat
import threading
import time
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

import httpx
import jsonschema

from sponsorkit import Sponsorkit, SponsorkitError, reset_process_state
from sponsorkit.models import ContributionResult
from sponsorkit.server import averify_session, verify_session

from .matcher import Vars, match, match_requests, substitute

KIT = Path(__file__).resolve().parents[3] / "conformance"

CONFIGURE_DEFAULTS: dict[str, Any] = {
    "apiBaseUrl": "$BASE_URL",
    "storageDir": "$STORAGE_DIR",
    "env": {},
}
"""Defaults of the configure step (scenarios.schema.json). ``devChecks``, ``signInTimeout`` and
``interactive`` have none: when absent, the SDK default applies (PROTOCOL §7)."""

PREDICATES: dict[str, Callable[[ContributionResult], bool]] = {
    "always": lambda fc: True,
    "never": lambda fc: False,
    "noActive": lambda fc: len(fc.active()) == 0,
}


class ScenarioError(AssertionError):
    pass


def load_scenarios() -> dict[str, Any]:
    with (KIT / "scenarios.json").open(encoding="utf-8") as f:
        data: dict[str, Any] = json.load(f)
    return data


def storage_file_schema() -> dict[str, Any]:
    with (KIT / "schemas" / "storage-file.schema.json").open(encoding="utf-8") as f:
        data: dict[str, Any] = json.load(f)
    return data


class Control:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url
        self.http = httpx.Client(trust_env=False, timeout=30)

    def call(self, method: str, path: str, body: Any = None) -> Any:
        res = self.http.request(method, f"{self.base_url}{path}", json=body)
        data = res.json()
        if res.status_code >= 400:
            raise RuntimeError(f"{method} {path} -> {res.status_code}: {data}")
        return data

    def state(self) -> dict[str, Any]:
        result: dict[str, Any] = self.call("GET", "/__control")
        return result

    def requests(self, since: int) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = self.call("GET", f"/__control/requests?since={since}")["requests"]
        return result


class Hooks:
    """openBrowser / promptForCode replacements: an HTTP GET that follows redirects."""

    def open_browser(self, url: str) -> None:
        with httpx.Client(trust_env=False, follow_redirects=True, timeout=30) as c:
            c.get(url)

    def prompt_for_code(self, url: str) -> str:
        with httpx.Client(trust_env=False, follow_redirects=True, timeout=30) as c:
            res = c.get(url)
        code: str | None = res.headers.get("sponsorkit-conformance-code")
        if not code:
            raise RuntimeError(f"No code at {url} (status {res.status_code})")
        return code


class Instance(Protocol):
    def run(self, action: str, args: dict[str, Any]) -> Any: ...


class Adapter(Protocol):
    name: str

    def create(self, config: dict[str, Any], hooks: Hooks) -> Instance: ...

    def verify_session(self, token: str, targets: dict[str, str], base_url: str) -> Any: ...


def _with_cancel_after(args: dict[str, Any], fn: Callable[[threading.Event], Any]) -> Any:
    """Run ``fn(cancel)``, setting ``cancel`` ``args["cancelAfter"]`` seconds after the call starts."""
    cancel = threading.Event()
    timer = threading.Timer(args["cancelAfter"], cancel.set) if "cancelAfter" in args else None
    if timer:
        timer.start()
    try:
        return fn(cancel)
    finally:
        if timer:
            timer.cancel()


async def _awith_cancel_after(args: dict[str, Any], fn: Callable[[asyncio.Event], Any]) -> Any:
    """Async :func:`_with_cancel_after`, with an :class:`asyncio.Event`."""
    cancel = asyncio.Event()
    handle = (
        asyncio.get_running_loop().call_later(args["cancelAfter"], cancel.set)
        if "cancelAfter" in args
        else None
    )
    try:
        return await fn(cancel)
    finally:
        if handle:
            handle.cancel()


def _construct(config: dict[str, Any], hooks: Hooks) -> Sponsorkit:
    optional: dict[str, Any] = {}
    if "devChecks" in config:
        optional["dev_checks"] = config["devChecks"]
    if "signInTimeout" in config:
        optional["sign_in_timeout"] = config["signInTimeout"]
    if "requestTimeout" in config:
        optional["request_timeout"] = config["requestTimeout"]
    if "interactive" in config:
        optional["interactive"] = config["interactive"]
    return Sponsorkit(
        github=config.get("github"),
        opencollective=config.get("opencollective"),
        app_name=config.get("appName"),
        cache_ttl=config.get("cacheTtl", 3600),
        mock=config.get("mock"),
        api_base_url=config["apiBaseUrl"],
        storage_dir=config["storageDir"],
        sign_in_method=config.get("signInMethod", "auto"),
        env=config["env"],
        open_browser=hooks.open_browser,
        prompt_for_code=hooks.prompt_for_code,
        **optional,
    )


def _checkout_kwargs(args: dict[str, Any]) -> dict[str, Any]:
    kw: dict[str, Any] = {
        "provider": args.get("provider"),
        "amount": args.get("amount"),
        "currency": args.get("currency"),
        "frequency": args.get("frequency"),
        "method": args.get("method"),
    }
    if "timeout" in args:
        kw["timeout"] = args["timeout"]
    if "pollInterval" in args:
        kw["poll_interval"] = args["pollInterval"]
    return kw


def _url_kwargs(args: dict[str, Any]) -> dict[str, Any]:
    return {k: args.get(k) for k in ("provider", "amount", "currency", "frequency")}


class SyncInstance:
    def __init__(self, sk: Sponsorkit) -> None:
        self.sk = sk

    def run(self, action: str, args: dict[str, Any]) -> Any:
        sk = self.sk
        if action == "signIn":
            return _with_cancel_after(
                args, lambda c: sk.sign_in(args.get("provider"), method=args["method"], cancel=c)
            )
        if action == "isSignedIn":
            return sk.is_signed_in()
        if action == "getFinancialContribution":
            return sk.get_financial_contribution(cache_ttl=args.get("cacheTtl"))
        if action == "openCheckout":
            return _with_cancel_after(args, lambda c: sk.open_checkout(cancel=c, **_checkout_kwargs(args)))
        if action == "checkoutUrl":
            return sk.checkout_url(**_url_kwargs(args))
        if action == "signOut":
            return sk.sign_out()
        if action == "nagDue":
            nag = sk.nag(args["id"], every=args["every"], or_every=args.get("orEvery"))
            return nag.due(PREDICATES[args["predicate"]], force=args.get("force", False))
        if action == "nagShown":
            return sk.nag(args["id"]).shown()
        raise AssertionError(f"unknown SDK action {action}")


class SyncAdapter:
    name = "sync"

    def create(self, config: dict[str, Any], hooks: Hooks) -> Instance:
        return SyncInstance(_construct(config, hooks))

    def verify_session(self, token: str, targets: dict[str, str], base_url: str) -> Any:
        return verify_session(token, targets, api_base_url=base_url)


class AsyncInstance:
    """Drives the ``a*`` coroutine variants, each step in a fresh event loop."""

    def __init__(self, sk: Sponsorkit) -> None:
        self.sk = sk

    def run(self, action: str, args: dict[str, Any]) -> Any:
        return asyncio.run(self._run(action, args))

    async def _run(self, action: str, args: dict[str, Any]) -> Any:
        sk = self.sk
        if action == "signIn":
            return await _awith_cancel_after(
                args, lambda c: sk.asign_in(args.get("provider"), method=args["method"], cancel=c)
            )
        if action == "isSignedIn":
            return await sk.ais_signed_in()
        if action == "getFinancialContribution":
            return await sk.aget_financial_contribution(cache_ttl=args.get("cacheTtl"))
        if action == "openCheckout":
            return await _awith_cancel_after(
                args, lambda c: sk.aopen_checkout(cancel=c, **_checkout_kwargs(args))
            )
        if action == "checkoutUrl":
            return sk.checkout_url(**_url_kwargs(args))
        if action == "signOut":
            return await sk.asign_out()
        if action == "nagDue":
            nag = sk.nag(args["id"], every=args["every"], or_every=args.get("orEvery"))
            return await nag.adue(PREDICATES[args["predicate"]], force=args.get("force", False))
        if action == "nagShown":
            return await sk.nag(args["id"]).ashown()
        raise AssertionError(f"unknown SDK action {action}")


class AsyncAdapter:
    name = "async"

    def create(self, config: dict[str, Any], hooks: Hooks) -> Instance:
        return AsyncInstance(_construct(config, hooks))

    def verify_session(self, token: str, targets: dict[str, str], base_url: str) -> Any:
        return asyncio.run(averify_session(token, targets, api_base_url=base_url))


def _normalize(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "to_dict"):
        return value.to_dict()
    if isinstance(value, list):
        return [_normalize(v) for v in value]
    return value


def _glob_count(pattern: str) -> int:
    directory, name = os.path.split(pattern)
    try:
        return sum(1 for n in os.listdir(directory) if fnmatch.fnmatchcase(n, name))
    except FileNotFoundError:
        return 0


def run_scenario(
    scenario: dict[str, Any],
    adapter: Adapter,
    *,
    base_url: str,
    variables: dict[str, str],
    storage_root: Path,
) -> None:
    control = Control(base_url)
    storage_dir = str(storage_root / f"{scenario['id']}-{uuid.uuid4().hex[:8]}")
    control.call("POST", "/__control/reset")
    control.call("POST", "/__control", {"scenario": scenario["id"]})
    reset_process_state()
    unreachable = control.call("GET", "/__control/unreachable")["baseUrl"]
    start_seq = control.state()["lastRequestSeq"]

    static: Vars = {"$BASE_URL": base_url, "$STORAGE_DIR": storage_dir, "$UNREACHABLE_BASE_URL": unreachable}
    minted: list[str] = []
    constants: Vars = {k: v for k, v in variables.items() if not v.startswith("runtime:")}

    def runtime_vars() -> Vars:
        s = control.state()
        v: Vars = {**static, "$NOW": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
        if s.get("lastSessionToken"):
            v["$LAST_SESSION_TOKEN"] = s["lastSessionToken"]
        for i, t in enumerate(s.get("issuedSessionTokens", [])):
            v[f"$SESSION_TOKEN_{i + 1}"] = t
        if minted:
            v["$MINTED_SESSION_TOKEN"] = minted[-1]
        return v

    def resolve(value: Any) -> Any:
        return substitute(substitute(substitute(value, constants), constants), runtime_vars())

    saved_env: dict[str, str | None] = {}

    def set_process_env(values: dict[str, str] | None) -> None:
        for k, v in (values or {}).items():
            if k not in saved_env:
                saved_env[k] = os.environ.get(k)
            os.environ[k] = v

    def restore_process_env() -> None:
        for k, v in saved_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        saved_env.clear()

    hooks = Hooks()
    config: dict[str, Any] | None = None
    instance: Instance | None = None

    def exec_step(step: dict[str, Any], on: Instance | None = None, *, current: bool = True) -> Any:
        nonlocal config, instance
        target = instance if current else on
        action = step["action"]
        args = step.get("args", {})
        if action == "configure":
            instance = None
            config = {**CONFIGURE_DEFAULTS, **args}
            config = resolve(config)
            set_process_env(config.get("processEnv"))
            instance = adapter.create(config, hooks)
            return None
        if action == "restart":
            if config is None:
                raise AssertionError("restart before configure")
            instance = None
            reset_process_state()
            instance = adapter.create(config, hooks)
            return None
        if action == "verifySession":
            return adapter.verify_session(args["token"], args["targets"], args.get("apiBaseUrl") or base_url)
        if action == "control":
            return control.call("PATCH", "/__control", args)
        if action == "mintSession":
            r = control.call("POST", "/__control/sessions", args)
            minted.append(r["sessionToken"])
            return r
        if action == "writeStorage":
            path = resolve(args.get("path", "$STORAGE_FILE"))
            os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(args["json"], f)
            os.chmod(path, 0o600)
            return None
        if action == "wait":
            time.sleep(args["seconds"])
            return None
        if target is None:
            raise AssertionError("No SDK instance (configure failed or was not called)")
        return target.run(action, args)

    try:
        _run_steps(scenario, control, exec_step, resolve, adapter, hooks, lambda: config)
    finally:
        restore_process_env()
    _check_final(scenario, control, resolve, start_seq)


def _run_steps(
    scenario: dict[str, Any],
    control: Control,
    exec_step: Callable[..., Any],
    resolve: Callable[[Any], Any],
    adapter: Adapter,
    hooks: Hooks,
    current_config: Callable[[], dict[str, Any] | None],
) -> None:
    for index, raw in enumerate(scenario["steps"]):
        label = f"step {index + 1} ({raw['action']})"
        seq = control.state()["lastRequestSeq"]
        started = time.monotonic()
        returned: Any = None
        thrown: BaseException | None = None
        try:
            if raw["action"] == "group":
                for s in raw["steps"]:
                    s = dict(s)
                    if s["action"] != "configure":
                        s["args"] = resolve(s.get("args", {}))
                    returned = exec_step(s)
            elif raw["action"] == "parallel":
                config = current_config()
                if config is None:
                    raise AssertionError("parallel before configure")
                inner = dict(raw["args"]["step"])
                inner["args"] = resolve(inner.get("args", {}))
                n = raw["args"]["instances"]
                instances = [adapter.create(config, hooks) for _ in range(n)]
                with ThreadPoolExecutor(max_workers=n) as pool:
                    futures = [pool.submit(exec_step, inner, i, current=False) for i in instances]
                    returned = [f.result() for f in futures]
            else:
                step = dict(raw)
                if step["action"] != "configure":
                    step["args"] = resolve(step.get("args", {}))
                returned = exec_step(step)
        except Exception as e:
            thrown = e
        seconds = time.monotonic() - started
        expect = raw.get("expect")
        problems: list[str] = []
        if thrown is not None:
            code = thrown.code if isinstance(thrown, SponsorkitError) else None
            if not expect or "throws" not in expect:
                problems.append(f"unexpected error: {code or repr(thrown)}")
            elif code != expect["throws"]:
                problems.append(f"expected error {expect['throws']}, got {code or repr(thrown)}")
        elif expect and "throws" in expect:
            problems.append(f"expected error {expect['throws']}, but the step succeeded")
        if expect:
            ex = resolve(expect)
            value = _normalize(returned)
            if thrown is None and "returns" in ex:
                problems.extend(match(value, ex["returns"], "returns"))
            if thrown is not None and "error" in ex:
                err = {
                    "code": thrown.code if isinstance(thrown, SponsorkitError) else None,
                    "retryAfter": thrown.retry_after if isinstance(thrown, SponsorkitError) else None,
                }
                problems.extend(match(err, ex["error"], "error"))
            if thrown is None and "contributionIds" in ex:
                v = value if isinstance(value, dict) else {}
                items = v.get("contributions") or ([v["contribution"]] if v.get("contribution") else [])
                got = sorted(c["id"] for c in items)
                want = sorted(ex["contributionIds"])
                if got != want:
                    problems.append(f"contribution ids {got} != {want}")
            if "requests" in ex:
                problems.extend(match_requests(control.requests(seq), ex["requests"]))
            if "minSeconds" in ex and seconds < ex["minSeconds"]:
                problems.append(f"took {seconds:.2f} s, expected >= {ex['minSeconds']}")
            if "maxSeconds" in ex and seconds > ex["maxSeconds"]:
                problems.append(f"took {seconds:.2f} s, expected <= {ex['maxSeconds']}")
        if problems:
            raise ScenarioError(f"{scenario['id']} / {label}:\n  - " + "\n  - ".join(problems))


def _check_final(
    scenario: dict[str, Any], control: Control, resolve: Callable[[Any], Any], start_seq: int
) -> None:
    final = scenario.get("expect")
    if not final:
        return
    fin = resolve(final)
    problems = []
    if "requests" in fin:
        problems.extend(match_requests(control.requests(start_seq), fin["requests"]))
    for f in fin.get("files", []):
        if "glob" in f:
            n = _glob_count(f["glob"])
            if n != f["count"]:
                problems.append(f"{f['glob']}: {n} file(s), expected {f['count']}")
            continue
        path = f["path"]
        try:
            st: os.stat_result | None = os.stat(path)
        except FileNotFoundError:
            st = None
        if f["exists"] is True and st is None:
            problems.append(f"{path}: does not exist")
        if f["exists"] is False and st is not None:
            problems.append(f"{path}: exists but should not")
        if st is None:
            continue
        if f.get("kind") == "directory" and not stat.S_ISDIR(st.st_mode):
            problems.append(f"{path}: not a directory")
        if f.get("kind") == "file" and not stat.S_ISREG(st.st_mode):
            problems.append(f"{path}: not a file")
        if f.get("mode") and os.name == "posix":
            mode = f"0{stat.S_IMODE(st.st_mode):o}"
            if mode != f["mode"]:
                problems.append(f"{path}: mode {mode}, expected {f['mode']}")
        if "json" in f or "schema" in f:
            try:
                with open(path, encoding="utf-8") as fh:
                    data = json.load(fh)
            except ValueError as err:
                problems.append(f"{path}: not valid JSON ({err})")
                continue
            if f.get("schema") == "storage-file":
                try:
                    jsonschema.validate(data, storage_file_schema())
                except jsonschema.ValidationError as err:
                    problems.append(f"{path}: does not match the storage-file schema: {err.message}")
            if "json" in f:
                problems.extend(match(data, f["json"], os.path.basename(path)))
    if problems:
        raise ScenarioError(f"{scenario['id']} / final expectations:\n  - " + "\n  - ".join(problems))
