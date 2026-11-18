//! Port of sdks/conformance/src/matcher.ts (README §3.5–§3.6).

use std::collections::BTreeMap;

use regex::Regex;
use serde_json::{Map, Value};

pub type Vars = BTreeMap<String, String>;

/// Replaces `$NAME` variables in every string, longest names first.
pub fn substitute(value: &Value, vars: &Vars) -> Value {
    let mut names: Vec<&String> = vars.keys().collect();
    names.sort_by_key(|n| std::cmp::Reverse(n.len()));
    fn walk(v: &Value, names: &[&String], vars: &Vars) -> Value {
        match v {
            Value::String(s) => {
                let mut out = s.clone();
                for n in names {
                    if out.contains(n.as_str()) {
                        out = out.replace(n.as_str(), &vars[n.as_str()]);
                    }
                }
                Value::String(out)
            }
            Value::Array(a) => Value::Array(a.iter().map(|x| walk(x, names, vars)).collect()),
            Value::Object(o) => Value::Object(o.iter().map(|(k, x)| (k.clone(), walk(x, names, vars))).collect()),
            other => other.clone(),
        }
    }
    walk(value, &names, vars)
}

fn type_of(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

pub fn deep_equal(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| deep_equal(p, q)),
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| deep_equal(v, w)))
        }
        _ => a == b,
    }
}

fn is_operator(m: &Value) -> bool {
    m.as_object().is_some_and(|o| o.keys().any(|k| k.starts_with('$')))
}

fn show(v: Option<&Value>) -> String {
    v.map(|v| v.to_string()).unwrap_or_else(|| "undefined".into())
}

static ISO_DATETIME: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$").unwrap()
});

pub fn is_datetime(s: &str) -> bool {
    ISO_DATETIME.is_match(s)
}

/// Returns mismatch descriptions; empty means the value matches. `None` is "undefined".
pub fn matches(actual: Option<&Value>, expected: &Value, path: &str) -> Vec<String> {
    if is_operator(expected) {
        let mut errors = Vec::new();
        for (op, arg) in expected.as_object().unwrap() {
            match op.as_str() {
                "$exact" => {
                    if !actual.is_some_and(|a| deep_equal(a, arg)) {
                        errors.push(format!("{path}: expected exactly {arg}, got {}", show(actual)));
                    }
                }
                "$regex" => {
                    let re = Regex::new(arg.as_str().unwrap_or_default()).expect("valid regex in scenarios.json");
                    if !actual.and_then(Value::as_str).is_some_and(|s| re.is_match(s)) {
                        errors.push(format!(
                            "{path}: {} does not match /{}/",
                            show(actual),
                            arg.as_str().unwrap_or("")
                        ));
                    }
                }
                "$absent" => {
                    if *arg == Value::Bool(true) && actual.is_some_and(|a| !a.is_null()) {
                        errors.push(format!("{path}: expected absent or null, got {}", show(actual)));
                    }
                }
                "$any" => {
                    if *arg == Value::Bool(true) && actual.is_none() {
                        errors.push(format!("{path}: expected a value"));
                    }
                }
                "$type" => {
                    let want = arg.as_str().unwrap_or_default();
                    let ok = match (want, actual) {
                        (_, None) => false,
                        ("datetime", Some(a)) => a.as_str().is_some_and(is_datetime),
                        ("integer", Some(a)) => {
                            a.is_i64() || a.is_u64() || a.as_f64().is_some_and(|f| f.fract() == 0.0 && f.is_finite())
                        }
                        (t, Some(a)) => type_of(a) == t,
                    };
                    if !ok {
                        errors.push(format!("{path}: expected type {want}, got {}", show(actual)));
                    }
                }
                "$len" => {
                    let len = match actual {
                        Some(Value::Array(a)) => Some(a.len() as u64),
                        Some(Value::String(s)) => Some(s.encode_utf16().count() as u64),
                        _ => None,
                    };
                    if len != arg.as_u64() {
                        errors.push(format!("{path}: expected length {arg}, got {len:?}"));
                    }
                }
                "$oneOf" => {
                    let options = arg.as_array().cloned().unwrap_or_default();
                    if !options.iter().any(|o| matches(actual, o, path).is_empty()) {
                        errors.push(format!("{path}: {} matches none of {arg}", show(actual)));
                    }
                }
                "$url" => {
                    let Some(s) = actual.and_then(Value::as_str) else {
                        errors.push(format!("{path}: {} is not a URL", show(actual)));
                        continue;
                    };
                    let Ok(u) = reqwest::Url::parse(s) else {
                        errors.push(format!("{path}: {s} is not a URL"));
                        continue;
                    };
                    let origin = u.origin().ascii_serialization();
                    let base = format!("{origin}{}", u.path());
                    if Some(base.as_str()) != arg["base"].as_str() {
                        errors.push(format!("{path}: URL base {base} !== {}", arg["base"]));
                    }
                    if let Some(q) = arg.get("query") {
                        let mut obj = Map::new();
                        for (k, v) in u.query_pairs() {
                            obj.insert(k.into_owned(), Value::String(v.into_owned()));
                        }
                        errors.extend(matches(Some(&Value::Object(obj)), q, &format!("{path}?")));
                    }
                }
                "$keys" => {
                    let mut keys: Vec<String> =
                        actual.and_then(Value::as_object).map(|o| o.keys().cloned().collect()).unwrap_or_default();
                    keys.sort();
                    let mut want: Vec<String> = arg
                        .as_array()
                        .map(|a| a.iter().filter_map(|k| k.as_str().map(str::to_owned)).collect())
                        .unwrap_or_default();
                    want.sort();
                    if keys != want {
                        errors.push(format!("{path}: keys {keys:?} !== {want:?}"));
                    }
                }
                other => errors.push(format!("{path}: unknown operator {other}")),
            }
        }
        return errors;
    }
    match expected {
        Value::Array(exp) => {
            let Some(Value::Array(act)) = actual else {
                return vec![format!("{path}: expected an array, got {}", show(actual))];
            };
            if act.len() != exp.len() {
                return vec![format!("{path}: expected {} items, got {}", exp.len(), act.len())];
            }
            exp.iter()
                .zip(act)
                .enumerate()
                .flat_map(|(i, (e, a))| matches(Some(a), e, &format!("{path}[{i}]")))
                .collect()
        }
        Value::Object(exp) => {
            let Some(Value::Object(act)) = actual else {
                return vec![format!("{path}: expected an object, got {}", show(actual))];
            };
            exp.iter().flat_map(|(k, e)| matches(act.get(k), e, &format!("{path}.{k}"))).collect()
        }
        _ => {
            if actual.is_some_and(|a| deep_equal(a, expected)) {
                vec![]
            } else {
                vec![format!("{path}: expected {expected}, got {}", show(actual))]
            }
        }
    }
}

/// ` (api)` / ` (site)` for a call or logged request that names its listener.
fn server_suffix(v: &Value) -> String {
    v.get("server").and_then(Value::as_str).map(|s| format!(" ({s})")).unwrap_or_default()
}

/// Request-log assertion.
pub fn match_requests(log: &[Value], spec: &Value) -> Vec<String> {
    let exact = spec.get("exact").and_then(Value::as_bool).unwrap_or(true);
    let include_targets = spec.get("includeTargetsLookups").and_then(Value::as_bool).unwrap_or(false);
    let relevant: Vec<&Value> =
        log.iter().filter(|r| include_targets || !(r["method"] == "GET" && r["path"] == "/api/v1/targets")).collect();
    let mut errors = Vec::new();
    let mut matched = vec![false; relevant.len()];
    let empty = Vec::new();
    for call in spec.get("calls").and_then(Value::as_array).unwrap_or(&empty) {
        let mut n = 0u64;
        for (i, r) in relevant.iter().enumerate() {
            if r["method"] != call["method"] || r["path"] != call["path"] {
                continue;
            }
            // Optional `server` ("api" | "site"): the listener that must have received it.
            if call.get("server").is_some_and(|s| !s.is_null() && r.get("server") != Some(s)) {
                continue;
            }
            let ok = ["query", "headers", "body"]
                .iter()
                .all(|k| call.get(*k).is_none_or(|m| matches(r.get(*k), m, "$").is_empty()));
            if ok {
                matched[i] = true;
                n += 1;
            }
        }
        let label = format!(
            "{} {}{}",
            call["method"].as_str().unwrap_or(""),
            call["path"].as_str().unwrap_or(""),
            server_suffix(call)
        );
        let (count, min, max) = (call["count"].as_u64(), call["min"].as_u64(), call["max"].as_u64());
        if let Some(c) = count {
            if n != c {
                errors.push(format!("{label}: expected {c} matching request(s), got {n}"));
            }
        }
        if let Some(m) = min {
            if n < m {
                errors.push(format!("{label}: expected at least {m}, got {n}"));
            }
        }
        if let Some(m) = max {
            if n > m {
                errors.push(format!("{label}: expected at most {m}, got {n}"));
            }
        }
        if count.is_none() && min.is_none() && max.is_none() && n < 1 {
            errors.push(format!("{label}: expected at least 1, got 0"));
        }
    }
    if exact {
        for (i, r) in relevant.iter().enumerate() {
            if !matched[i] {
                errors.push(format!(
                    "unexpected request {} {}{} {}",
                    r["method"].as_str().unwrap_or(""),
                    r["path"].as_str().unwrap_or(""),
                    server_suffix(r),
                    r["query"]
                ));
            }
        }
    }
    errors
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn subset_and_operators() {
        let v = json!({ "a": 1, "b": "x", "c": null });
        assert!(matches(Some(&v), &json!({ "a": 1 }), "$").is_empty());
        assert!(!matches(Some(&v), &json!({ "$exact": { "a": 1 } }), "$").is_empty());
        assert!(matches(Some(&v), &json!({ "c": { "$absent": true }, "d": { "$absent": true } }), "$").is_empty());
        assert!(matches(Some(&json!("2026-11-16T18:00:00.000Z")), &json!({ "$type": "datetime" }), "$").is_empty());
        assert!(
            matches(
                Some(&json!("http://x:1/p?a=1&b=2")),
                &json!({ "$url": { "base": "http://x:1/p", "query": { "a": "1" } } }),
                "$"
            )
            .is_empty()
        );
    }

    #[test]
    fn request_server_field() {
        let log = vec![json!({ "method": "GET", "path": "/connect/", "server": "site", "query": {} })];
        let spec = |server: &str| json!({ "calls": [{ "method": "GET", "path": "/connect/", "server": server }] });
        assert!(match_requests(&log, &spec("site")).is_empty());
        assert!(!match_requests(&log, &spec("api")).is_empty());
        assert!(match_requests(&log, &json!({ "calls": [{ "method": "GET", "path": "/connect/" }] })).is_empty());
    }
}
