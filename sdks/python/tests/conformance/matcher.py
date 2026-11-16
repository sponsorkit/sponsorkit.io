"""Port of sdks/conformance/src/matcher.ts (README "Matchers" and "Request expectations")."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qsl, urlsplit

Vars = dict[str, str]

_ISO_DATETIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")


def substitute(value: Any, variables: Vars) -> Any:
    """Replace ``$NAME`` variables in every string; longest names first."""
    names = sorted(variables, key=len, reverse=True)

    def walk(v: Any) -> Any:
        if isinstance(v, str):
            for n in names:
                v = v.replace(n, variables[n])
            return v
        if isinstance(v, list):
            return [walk(x) for x in v]
        if isinstance(v, dict):
            return {k: walk(x) for k, x in v.items()}
        return v

    return walk(value)


def _type_of(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        return "number"
    if isinstance(v, str):
        return "string"
    if isinstance(v, list):
        return "array"
    return "object"


_MISSING = object()


def _deep_equal(a: Any, b: Any) -> bool:
    if _type_of(a) != _type_of(b):
        return False
    if isinstance(a, list):
        return len(a) == len(b) and all(_deep_equal(x, y) for x, y in zip(a, b, strict=True))
    if isinstance(a, dict):
        return set(a) == set(b) and all(_deep_equal(a[k], b[k]) for k in a)
    return bool(a == b)


def _is_operator(m: Any) -> bool:
    return isinstance(m, dict) and any(k.startswith("$") for k in m)


def _js(v: Any) -> str:
    import json

    return "undefined" if v is _MISSING else json.dumps(v)


def match(actual: Any, expected: Any, path: str = "$") -> list[str]:
    """Mismatch descriptions; empty means ``actual`` matches ``expected``. ``_MISSING`` means absent."""
    if _is_operator(expected):
        errors: list[str] = []
        for op, arg in expected.items():
            if op == "$exact":
                if actual is _MISSING or not _deep_equal(actual, arg):
                    errors.append(f"{path}: expected exactly {_js(arg)}, got {_js(actual)}")
            elif op == "$regex":
                if not isinstance(actual, str) or not re.search(str(arg), actual):
                    errors.append(f"{path}: {_js(actual)} does not match /{arg}/")
            elif op == "$absent":
                if arg is True and actual is not _MISSING and actual is not None:
                    errors.append(f"{path}: expected absent or null, got {_js(actual)}")
            elif op == "$any":
                if arg is True and actual is _MISSING:
                    errors.append(f"{path}: expected a value")
            elif op == "$type":
                if arg == "datetime":
                    ok = isinstance(actual, str) and bool(_ISO_DATETIME.match(actual))
                elif arg == "integer":
                    ok = (isinstance(actual, int) and not isinstance(actual, bool)) or (
                        isinstance(actual, float) and actual.is_integer()
                    )
                else:
                    ok = actual is not _MISSING and _type_of(actual) == arg
                if not ok:
                    errors.append(f"{path}: expected type {arg}, got {_js(actual)}")
            elif op == "$len":
                n = len(actual) if isinstance(actual, (list, str)) else None
                if n != arg:
                    errors.append(f"{path}: expected length {arg}, got {n}")
            elif op == "$oneOf":
                if not any(not match(actual, o, path) for o in arg):
                    errors.append(f"{path}: {_js(actual)} matches none of {_js(arg)}")
            elif op == "$url":
                if not isinstance(actual, str):
                    errors.append(f"{path}: {_js(actual)} is not a URL")
                    continue
                u = urlsplit(actual)
                base = f"{u.scheme}://{u.netloc}{u.path or '/'}"
                if base != arg["base"]:
                    errors.append(f"{path}: URL base {base} !== {arg['base']}")
                if "query" in arg:
                    errors.extend(
                        match(dict(parse_qsl(u.query, keep_blank_values=True)), arg["query"], f"{path}?")
                    )
            elif op == "$keys":
                keys = sorted(actual) if isinstance(actual, dict) else []
                if keys != sorted(arg):
                    errors.append(f"{path}: keys {keys} !== {sorted(arg)}")
            else:
                errors.append(f"{path}: unknown operator {op}")
        return errors
    if isinstance(expected, list):
        if not isinstance(actual, list):
            return [f"{path}: expected an array, got {_js(actual)}"]
        if len(actual) != len(expected):
            return [f"{path}: expected {len(expected)} items, got {len(actual)}"]
        return [e for i, x in enumerate(expected) for e in match(actual[i], x, f"{path}[{i}]")]
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return [f"{path}: expected an object, got {_js(actual)}"]
        return [e for k, x in expected.items() for e in match(actual.get(k, _MISSING), x, f"{path}.{k}")]
    if _type_of(actual) == _type_of(expected) and actual == expected and actual is not _MISSING:
        return []
    return [f"{path}: expected {_js(expected)}, got {_js(actual)}"]


def match_requests(log: list[dict[str, Any]], spec: dict[str, Any]) -> list[str]:
    """Request-log assertion."""
    exact = spec.get("exact", True)
    relevant = (
        log
        if spec.get("includeTargetsLookups", False)
        else [r for r in log if not (r["method"] == "GET" and r["path"] == "/api/v1/targets")]
    )
    errors: list[str] = []
    matched: set[int] = set()
    for call in spec.get("calls", []):
        hits = 0
        for i, r in enumerate(relevant):
            if r["method"] != call["method"] or r["path"] != call["path"]:
                continue
            ok = all(
                key not in call or not match(r.get(key, _MISSING), call[key])
                for key in ("query", "headers", "body")
            )
            if ok:
                matched.add(i)
                hits += 1
        label = f"{call['method']} {call['path']}"
        if "count" in call and hits != call["count"]:
            errors.append(f"{label}: expected {call['count']} matching request(s), got {hits}")
        if "min" in call and hits < call["min"]:
            errors.append(f"{label}: expected at least {call['min']}, got {hits}")
        if "max" in call and hits > call["max"]:
            errors.append(f"{label}: expected at most {call['max']}, got {hits}")
        if not any(k in call for k in ("count", "min", "max")) and hits < 1:
            errors.append(f"{label}: expected at least 1, got 0")
    if exact:
        for i, r in enumerate(relevant):
            if i not in matched:
                errors.append(f"unexpected request {r['method']} {r['path']} {r.get('query')}")
    return errors
