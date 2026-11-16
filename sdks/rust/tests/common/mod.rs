//! Conformance harness: a Rust port of sdks/conformance/src/runner.ts.
#![allow(dead_code)]

pub mod matcher;

use std::collections::{BTreeMap, HashMap};
use std::io::{BufRead as _, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use sponsorkit::{
    CancellationToken, CheckoutOptions, DueOptions, GetOptions, Mock, MockPreset, NagOptions, OpenBrowserHook, Options,
    PromptForCodeHook, Provider, SignInMethod, SignInOptions, Sponsorkit, Targets, server,
};

use matcher::{Vars, is_datetime, match_requests, matches, substitute};

pub fn conformance_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("conformance")
}

pub fn scenarios_file() -> &'static Value {
    static FILE: OnceLock<Value> = OnceLock::new();
    FILE.get_or_init(|| {
        let text = std::fs::read_to_string(conformance_dir().join("scenarios.json")).expect("read scenarios.json");
        serde_json::from_str(&text).expect("parse scenarios.json")
    })
}

pub fn scenario_ids() -> Vec<String> {
    scenarios_file()["scenarios"].as_array().unwrap().iter().map(|s| s["id"].as_str().unwrap().to_string()).collect()
}

struct FakeServer {
    base_url: String,
    // Kept alive for the whole test process. When the process exits, stdin
    // closes and the server stops (SPONSORKIT_CONFORMANCE_EXIT_ON_STDIN_EOF).
    _child: Mutex<Child>,
    _stdin: Mutex<ChildStdin>,
}

fn fake_server() -> &'static FakeServer {
    static SERVER: OnceLock<FakeServer> = OnceLock::new();
    SERVER.get_or_init(|| {
        let mut child = Command::new("bun")
            .arg(conformance_dir().join("server.ts"))
            .args(["--port", "0"])
            .env("SPONSORKIT_CONFORMANCE_EXIT_ON_STDIN_EOF", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn `bun sdks/conformance/server.ts` (is bun on PATH?)");
        let stdout = child.stdout.take().unwrap();
        let mut line = String::new();
        BufReader::new(stdout).read_line(&mut line).expect("read LISTENING line");
        let port: u16 = line
            .trim()
            .strip_prefix("LISTENING ")
            .and_then(|p| p.parse().ok())
            .unwrap_or_else(|| panic!("unexpected server output: {line:?}"));
        let stdin = child.stdin.take().unwrap();
        FakeServer {
            base_url: format!("http://127.0.0.1:{port}"),
            _child: Mutex::new(child),
            _stdin: Mutex::new(stdin),
        }
    })
}

/// Scenarios share one server and per-process SDK state: run them one at a time.
static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

struct Control {
    base: String,
    // One client per scenario: every #[tokio::test] has its own runtime, and a
    // pooled connection from a runtime that has shut down fails the next request.
    http: reqwest::Client,
}

impl Control {
    async fn call(&self, method: reqwest::Method, path: &str, body: Option<&Value>) -> Value {
        let mut req = self.http.request(method.clone(), format!("{}{}", self.base, path));
        if let Some(b) = body {
            req = req.json(b);
        }
        let res = req.send().await.unwrap_or_else(|e| panic!("{method} {path}: {e}"));
        let status = res.status();
        let data: Value = res.json().await.unwrap_or(Value::Null);
        assert!(status.is_success(), "{method} {path} -> {status}: {data}");
        data
    }
    async fn state(&self) -> Value {
        self.call(reqwest::Method::GET, "/__control", None).await
    }
    async fn requests(&self, since: u64) -> Vec<Value> {
        let r = self.call(reqwest::Method::GET, &format!("/__control/requests?since={since}"), None).await;
        r["requests"].as_array().cloned().unwrap_or_default()
    }
}

/// The harness's `openBrowser`: GET and follow redirects, like a browser without JavaScript.
async fn follow(url: String) -> std::io::Result<reqwest::Response> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(std::io::Error::other)?;
    client.get(&url).send().await.map_err(std::io::Error::other)
}

fn hooks() -> (OpenBrowserHook, PromptForCodeHook) {
    let open: OpenBrowserHook = Arc::new(|url| {
        Box::pin(async move {
            let res = follow(url).await?;
            let _ = res.bytes().await;
            Ok(())
        })
    });
    let prompt: PromptForCodeHook = Arc::new(|url| {
        Box::pin(async move {
            let res = follow(url.clone()).await?;
            let status = res.status();
            let code =
                res.headers().get("sponsorkit-conformance-code").and_then(|v| v.to_str().ok()).map(str::to_owned);
            let _ = res.bytes().await;
            code.ok_or_else(|| std::io::Error::other(format!("no code at {url} (status {status})")))
        })
    });
    (open, prompt)
}

#[derive(Debug)]
enum StepError {
    Sdk(sponsorkit::Error),
    Harness(String),
    /// The SDK's types cannot represent an argument (e.g. a fractional amount);
    /// the runner treats such a step as passed.
    Unrepresentable(String),
}

impl From<sponsorkit::Error> for StepError {
    fn from(e: sponsorkit::Error) -> Self {
        StepError::Sdk(e)
    }
}

type StepResult = Result<Value, StepError>;

fn secs(v: &Value) -> Option<Duration> {
    v.as_f64().map(Duration::from_secs_f64)
}

fn str_opt(v: &Value) -> Option<String> {
    v.as_str().map(str::to_owned)
}

fn provider(v: &Value) -> Result<Option<Provider>, StepError> {
    match v.as_str() {
        None => Ok(None),
        Some(s) => s.parse::<Provider>().map(Some).map_err(StepError::Sdk),
    }
}

fn method(v: &Value) -> Option<SignInMethod> {
    match v.as_str() {
        Some("loopback") => Some(SignInMethod::Loopback),
        Some("paste") => Some(SignInMethod::Paste),
        Some("auto") => Some(SignInMethod::Auto),
        _ => None,
    }
}

/// Sets `configure.processEnv` in the real process environment and restores
/// the previous values when dropped (at scenario end, even on failure).
#[derive(Default)]
struct ProcessEnvGuard {
    saved: Vec<(String, Option<std::ffi::OsString>)>,
}

impl ProcessEnvGuard {
    fn set(&mut self, vars: &Value) {
        for (k, v) in vars.as_object().into_iter().flatten() {
            if !self.saved.iter().any(|(name, _)| name == k) {
                self.saved.push((k.clone(), std::env::var_os(k)));
            }
            // SAFETY: scenarios run one at a time (SERIAL); while one runs no
            // other thread of this test binary reads these variables.
            #[allow(unsafe_code)]
            unsafe {
                std::env::set_var(k, v.as_str().unwrap_or_default());
            }
        }
    }
}

impl Drop for ProcessEnvGuard {
    fn drop(&mut self) {
        for (k, v) in self.saved.drain(..) {
            // SAFETY: see `set`.
            #[allow(unsafe_code)]
            unsafe {
                match v {
                    Some(v) => std::env::set_var(&k, v),
                    None => std::env::remove_var(&k),
                }
            }
        }
    }
}

/// Builds `Options` from `configure` args (README §3.3), with the schema defaults applied.
/// `env` is always passed (it replaces the process env); `devChecks`,
/// `signInTimeout` and `interactive` only when present.
fn options_from(args: &Value, ctx: &Ctx) -> Result<Options, StepError> {
    let (open, prompt) = hooks();
    let mock = match &args["mock"] {
        Value::Null => None,
        Value::String(s) => Some(Mock::Preset(s.parse::<MockPreset>()?)),
        other => Some(Mock::Contributions(
            serde_json::from_value(other["contributions"].clone()).map_err(|e| StepError::Harness(e.to_string()))?,
        )),
    };
    let env: HashMap<String, String> = args["env"]
        .as_object()
        .map(|o| o.iter().map(|(k, v)| (k.clone(), v.as_str().unwrap_or_default().to_string())).collect())
        .unwrap_or_default();
    Ok(Options {
        github: str_opt(&args["github"]),
        opencollective: str_opt(&args["opencollective"]),
        app_name: str_opt(&args["appName"]),
        cache_ttl: secs(&args["cacheTtl"]),
        mock,
        storage_dir: Some(PathBuf::from(args["storageDir"].as_str().unwrap_or(&ctx.storage_dir))),
        api_base_url: Some(args["apiBaseUrl"].as_str().unwrap_or(&ctx.base_url).to_string()),
        sign_in_method: method(&args["signInMethod"]).unwrap_or_default(),
        sign_in_timeout: secs(&args["signInTimeout"]),
        request_timeout: secs(&args["requestTimeout"]),
        env: Some(env),
        dev_checks: args["devChecks"].as_bool(),
        checkout_poll_interval: None,
        interactive: args["interactive"].as_bool(),
        open_browser: Some(open),
        prompt_for_code: Some(prompt),
        restart: false,
    })
}

struct Ctx {
    base_url: String,
    storage_dir: String,
    control: Control,
    config: Option<Value>,
    instance: Option<Sponsorkit>,
    minted: Option<String>,
    process_env: ProcessEnvGuard,
}

fn to_json<T: serde::Serialize>(v: &T) -> Value {
    serde_json::to_value(v).expect("serializable")
}

async fn exec_on(step: &Value, sk: Option<Sponsorkit>, ctx_base: &str) -> StepResult {
    let args = &step["args"];
    let need = || sk.clone().ok_or_else(|| StepError::Harness("no SDK instance (configure failed or missing)".into()));
    match step["action"].as_str().unwrap() {
        "signIn" => {
            let cancel = CancellationToken::new();
            let timer = secs(&args["cancelAfter"]).map(|d| {
                let c = cancel.clone();
                tokio::spawn(async move {
                    tokio::time::sleep(d).await;
                    c.cancel();
                })
            });
            let r = need()?
                .sign_in(SignInOptions {
                    provider: provider(&args["provider"])?,
                    method: method(&args["method"]),
                    cancel: Some(cancel),
                })
                .await;
            if let Some(t) = timer {
                t.abort();
            }
            r?;
            Ok(Value::Null)
        }
        "isSignedIn" => Ok(Value::Bool(need()?.is_signed_in())),
        "getFinancialContribution" => {
            let r = need()?.get_financial_contribution(GetOptions { cache_ttl: secs(&args["cacheTtl"]) }).await?;
            Ok(to_json(&r))
        }
        "openCheckout" => {
            let cancel = CancellationToken::new();
            let timer = secs(&args["cancelAfter"]).map(|d| {
                let c = cancel.clone();
                tokio::spawn(async move {
                    tokio::time::sleep(d).await;
                    c.cancel();
                })
            });
            let opts = CheckoutOptions {
                provider: provider(&args["provider"])?,
                amount: args["amount"].as_i64(),
                currency: str_opt(&args["currency"]),
                frequency: match args["frequency"].as_str() {
                    Some(f) => Some(f.parse()?),
                    None => None,
                },
                timeout: secs(&args["timeout"]),
                poll_interval: secs(&args["pollInterval"]),
                cancel: Some(cancel),
                sign_in_method: method(&args["method"]),
            };
            let r = need()?.open_checkout(opts).await;
            if let Some(t) = timer {
                t.abort();
            }
            Ok(to_json(&r?))
        }
        "checkoutUrl" => {
            let amount = match &args["amount"] {
                Value::Null => None,
                v => Some(v.as_i64().ok_or_else(|| StepError::Unrepresentable(format!("amount {v}")))?),
            };
            let opts = CheckoutOptions {
                provider: provider(&args["provider"])?,
                amount,
                currency: str_opt(&args["currency"]),
                frequency: match args["frequency"].as_str() {
                    Some(f) => Some(f.parse()?),
                    None => None,
                },
                ..Default::default()
            };
            Ok(Value::String(need()?.checkout_url(&opts)?))
        }
        "signOut" => {
            need()?.sign_out().await?;
            Ok(Value::Null)
        }
        "nagDue" => {
            let sk = need()?;
            let mut opts = NagOptions::new(args["id"].as_str().unwrap(), args["every"].as_u64().unwrap());
            if let Some(p) = args["orEvery"].as_str() {
                opts = opts.or_every(sponsorkit::parse_iso_duration(p)?);
            }
            let predicate = args["predicate"].as_str().unwrap().to_string();
            let due = sk
                .nag(opts)
                .due_with(
                    move |fc| match predicate.as_str() {
                        "always" => true,
                        "never" => false,
                        _ => fc.active().is_empty(),
                    },
                    DueOptions { force: args["force"].as_bool().unwrap_or(false) },
                )
                .await;
            Ok(Value::Bool(due))
        }
        "nagShown" => {
            need()?.nag(NagOptions::new(args["id"].as_str().unwrap(), 0)).shown().await;
            Ok(Value::Null)
        }
        "verifySession" => {
            let base = args["apiBaseUrl"].as_str().unwrap_or(ctx_base).to_string();
            let t = &args["targets"];
            let targets = Targets { github: str_opt(&t["github"]), opencollective: str_opt(&t["opencollective"]) };
            let r = server::verify_session_with(
                args["token"].as_str().unwrap(),
                &targets,
                server::VerifyOptions { api_base_url: Some(base), ..Default::default() },
            )
            .await?;
            Ok(to_json(&r))
        }
        "wait" => {
            tokio::time::sleep(secs(&args["seconds"]).unwrap()).await;
            Ok(Value::Null)
        }
        other => Err(StepError::Harness(format!("unsupported action {other}"))),
    }
}

async fn exec(step: &Value, ctx: &mut Ctx) -> StepResult {
    let args = &step["args"];
    match step["action"].as_str().unwrap() {
        "configure" => {
            ctx.instance = None;
            ctx.config = Some(args.clone());
            ctx.process_env.set(&args["processEnv"]);
            ctx.instance = Some(Sponsorkit::new(options_from(args, ctx)?)?);
            Ok(Value::Null)
        }
        "restart" => {
            let config = ctx.config.clone().ok_or_else(|| StepError::Harness("restart before configure".into()))?;
            ctx.instance = None;
            Sponsorkit::reset_process_state();
            ctx.instance = Some(Sponsorkit::new(options_from(&config, ctx)?)?);
            Ok(Value::Null)
        }
        "control" => {
            ctx.control.call(reqwest::Method::PATCH, "/__control", Some(args)).await;
            Ok(Value::Null)
        }
        "mintSession" => {
            let r = ctx.control.call(reqwest::Method::POST, "/__control/sessions", Some(args)).await;
            ctx.minted = r["sessionToken"].as_str().map(str::to_owned);
            Ok(r)
        }
        "writeStorage" => {
            let path = PathBuf::from(args["path"].as_str().unwrap());
            let dir = path.parent().unwrap();
            std::fs::create_dir_all(dir).map_err(|e| StepError::Harness(e.to_string()))?;
            std::fs::write(&path, serde_json::to_vec(&args["json"]).unwrap())
                .map_err(|e| StepError::Harness(e.to_string()))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700)).unwrap();
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
            }
            Ok(Value::Null)
        }
        "parallel" => {
            let config = ctx.config.clone().ok_or_else(|| StepError::Harness("parallel before configure".into()))?;
            let n = args["instances"].as_u64().unwrap();
            let mut set = tokio::task::JoinSet::new();
            for i in 0..n {
                let sk = Sponsorkit::new(options_from(&config, ctx)?)?;
                let inner = args["step"].clone();
                let base = ctx.base_url.clone();
                set.spawn(async move { (i, exec_on(&inner, Some(sk), &base).await) });
            }
            let mut out = vec![Value::Null; n as usize];
            while let Some(joined) = set.join_next().await {
                let (i, r) = joined.map_err(|e| StepError::Harness(e.to_string()))?;
                out[i as usize] = r?;
            }
            Ok(Value::Array(out))
        }
        _ => exec_on(step, ctx.instance.clone(), &ctx.base_url).await,
    }
}

fn glob_count(pattern: &str) -> usize {
    let p = Path::new(pattern);
    let dir = p.parent().unwrap();
    let name = p.file_name().unwrap().to_string_lossy();
    let re =
        regex::Regex::new(&format!("^{}$", name.split('*').map(regex::escape).collect::<Vec<_>>().join(".*"))).unwrap();
    std::fs::read_dir(dir)
        .map(|rd| rd.filter_map(|e| e.ok()).filter(|e| re.is_match(&e.file_name().to_string_lossy())).count())
        .unwrap_or(0)
}

/// Structural check of PROTOCOL §8 (mirrors schemas/storage-file.schema.json).
pub fn validate_storage_file(data: &Value) -> Vec<String> {
    let mut errors = Vec::new();
    let Some(obj) = data.as_object() else {
        return vec!["storage file is not an object".into()];
    };
    for k in obj.keys() {
        if !["v", "sessionToken", "cache", "nags"].contains(&k.as_str()) {
            errors.push(format!("unexpected key {k}"));
        }
    }
    if obj.get("v") != Some(&json!(1)) {
        errors.push("v must be 1".into());
    }
    match obj.get("sessionToken") {
        None | Some(Value::Null) => {}
        Some(Value::String(s)) if s.starts_with("sks_") => {}
        Some(other) => errors.push(format!("bad sessionToken {other}")),
    }
    match obj.get("cache") {
        None | Some(Value::Null) => {}
        Some(c) => {
            if !c["storedAt"].as_str().is_some_and(is_datetime) {
                errors.push("cache.storedAt is not a datetime".into());
            }
            if c.as_object().is_some_and(|o| o.len() != 2) {
                errors.push("cache has unexpected keys".into());
            }
            // Round-tripping through the typed model catches unknown keys and wrong types.
            match serde_json::from_value::<sponsorkit::ContributionResult>(c["result"].clone()) {
                Ok(r) => {
                    if !matcher::deep_equal(&serde_json::to_value(&r).unwrap(), &c["result"]) {
                        errors.push("cache.result does not round-trip (unknown keys?)".into());
                    }
                }
                Err(e) => errors.push(format!("cache.result is not a ContributionResult: {e}")),
            }
        }
    }
    if let Some(n) = obj.get("nags") {
        match n.as_object() {
            None => errors.push("nags is not an object".into()),
            Some(m) => {
                for (id, s) in m {
                    let ok_runs = s["runs"].as_u64().is_some();
                    let ok_last = s["lastShown"].is_null() || s["lastShown"].as_str().is_some_and(is_datetime);
                    let ok_keys = s.as_object().is_some_and(|o| o.keys().all(|k| k == "runs" || k == "lastShown"))
                        && s.get("lastShown").is_some();
                    if !(ok_runs && ok_last && ok_keys) {
                        errors.push(format!("bad nag state {id}: {s}"));
                    }
                }
            }
        }
    }
    errors
}

fn storage_root() -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(format!("conformance-{}", std::process::id()));
    std::fs::create_dir_all(&root).unwrap();
    root
}

/// Runs one scenario of scenarios.json; panics with every mismatch found.
pub async fn run(id: &str) {
    let _serial = SERIAL.lock().await;
    let file = scenarios_file();
    let scenario = file["scenarios"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["id"] == id)
        .unwrap_or_else(|| panic!("scenario {id} not found in scenarios.json"))
        .clone();
    let server = fake_server();
    let control = Control { base: server.base_url.clone(), http: reqwest::Client::new() };
    let suffix: u32 = std::process::id() ^ (Instant::now().elapsed().subsec_nanos() + rand_u32());
    let storage_dir = storage_root().join(format!("{id}-{suffix:08x}")).to_string_lossy().into_owned();

    control.call(reqwest::Method::POST, "/__control/reset", None).await;
    control.call(reqwest::Method::POST, "/__control", Some(&json!({ "scenario": id }))).await;
    Sponsorkit::reset_process_state();
    let unreachable = control.call(reqwest::Method::GET, "/__control/unreachable", None).await["baseUrl"]
        .as_str()
        .unwrap()
        .to_string();
    let start_seq = control.state().await["lastRequestSeq"].as_u64().unwrap_or(0);

    let constants: Vars = file["variables"]
        .as_object()
        .unwrap()
        .iter()
        .filter_map(|(k, v)| v.as_str().filter(|s| !s.starts_with("runtime:")).map(|s| (k.clone(), s.to_string())))
        .collect();

    let mut ctx = Ctx {
        base_url: server.base_url.clone(),
        storage_dir: storage_dir.clone(),
        control,
        config: None,
        instance: None,
        minted: None,
        process_env: ProcessEnvGuard::default(),
    };

    async fn vars(ctx: &Ctx, unreachable: &str) -> Vars {
        let s = ctx.control.state().await;
        let mut v: Vars = BTreeMap::new();
        v.insert("$BASE_URL".into(), ctx.base_url.clone());
        v.insert("$STORAGE_DIR".into(), ctx.storage_dir.clone());
        v.insert("$UNREACHABLE_BASE_URL".into(), unreachable.to_string());
        v.insert("$NOW".into(), now_iso());
        if let Some(t) = s["lastSessionToken"].as_str() {
            v.insert("$LAST_SESSION_TOKEN".into(), t.into());
        }
        for (i, t) in s["issuedSessionTokens"].as_array().cloned().unwrap_or_default().iter().enumerate() {
            v.insert(format!("$SESSION_TOKEN_{}", i + 1), t.as_str().unwrap_or_default().to_string());
        }
        if let Some(m) = &ctx.minted {
            v.insert("$MINTED_SESSION_TOKEN".into(), m.clone());
        }
        v
    }
    let resolve_const = |v: &Value| substitute(&substitute(v, &constants), &constants);

    // Applies the schema defaults of `configure` args and `writeStorage.path`.
    fn with_defaults(step: &Value) -> Value {
        let mut s = step.clone();
        match s["action"].as_str() {
            Some("configure") => {
                let args = s["args"].as_object_mut();
                if let Some(a) = args {
                    a.entry("apiBaseUrl").or_insert(json!("$BASE_URL"));
                    a.entry("storageDir").or_insert(json!("$STORAGE_DIR"));
                    a.entry("env").or_insert(json!({}));
                } else {
                    s["args"] = json!({ "apiBaseUrl": "$BASE_URL", "storageDir": "$STORAGE_DIR", "env": {} });
                }
            }
            Some("verifySession") => {
                if let Some(a) = s["args"].as_object_mut() {
                    a.entry("apiBaseUrl").or_insert(json!("$BASE_URL"));
                }
            }
            Some("writeStorage") => {
                if let Some(a) = s["args"].as_object_mut() {
                    a.entry("path").or_insert(json!("$STORAGE_FILE"));
                }
            }
            _ => {}
        }
        if s.get("args").is_none_or(Value::is_null) {
            s["args"] = json!({});
        }
        if let Some(inner) = s["args"].get("step").cloned() {
            s["args"]["step"] = with_defaults(&inner);
        }
        if let Some(steps) = s.get("steps").and_then(Value::as_array).cloned() {
            s["steps"] = Value::Array(steps.iter().map(with_defaults).collect());
        }
        s
    }

    let mut failures: Vec<String> = Vec::new();
    for (index, raw) in scenario["steps"].as_array().unwrap().iter().enumerate() {
        let raw = with_defaults(raw);
        let action = raw["action"].as_str().unwrap().to_string();
        let label = format!("step {} ({action})", index + 1);
        let seq = ctx.control.state().await["lastRequestSeq"].as_u64().unwrap_or(0);
        let started = Instant::now();
        let outcome: StepResult = if action == "group" {
            let mut last = Ok(Value::Null);
            for s in raw["steps"].as_array().unwrap() {
                let v = vars(&ctx, &unreachable).await;
                let resolved = substitute(&resolve_const(s), &v);
                last = exec(&resolved, &mut ctx).await;
                if last.is_err() {
                    break;
                }
            }
            last
        } else {
            let v = vars(&ctx, &unreachable).await;
            let resolved = substitute(&resolve_const(&raw), &v);
            exec(&resolved, &mut ctx).await
        };
        let seconds = started.elapsed().as_secs_f64();
        let mut problems = Vec::new();
        let expect = raw.get("expect").cloned().unwrap_or(Value::Null);
        let expect = if expect.is_null() {
            Value::Null
        } else {
            let v = vars(&ctx, &unreachable).await;
            substitute(&resolve_const(&expect), &v)
        };
        let throws = expect.get("throws").and_then(Value::as_str);
        if let Err(StepError::Unrepresentable(_)) = &outcome {
            continue; // README: a value the SDK's types cannot express counts as passed.
        }
        let returned = match &outcome {
            Err(StepError::Unrepresentable(_)) => unreachable!(),
            Err(StepError::Harness(m)) => {
                problems.push(format!("harness error: {m}"));
                None
            }
            Err(StepError::Sdk(e)) => {
                match throws {
                    None => problems.push(format!("unexpected error: {} ({})", e.code().as_str(), e.message())),
                    Some(t) if t != e.code().as_str() => {
                        problems.push(format!("expected error {t}, got {} ({})", e.code().as_str(), e.message()))
                    }
                    _ => {}
                }
                if let Some(m) = expect.get("error") {
                    let normalized = json!({
                        "code": e.code().as_str(),
                        "retryAfter": e.retry_after().map(|d| d.as_secs()),
                    });
                    problems.extend(matches(Some(&normalized), m, "error"));
                }
                None
            }
            Ok(v) => {
                if let Some(t) = throws {
                    problems.push(format!("expected error {t}, but the step succeeded"));
                }
                Some(v.clone())
            }
        };
        if !expect.is_null() {
            if let (Some(value), Some(m)) = (&returned, expect.get("returns")) {
                problems.extend(matches(Some(value), m, "returns"));
            }
            if let (Some(value), Some(want)) = (&returned, expect.get("contributionIds")) {
                let list = value
                    .get("contributions")
                    .and_then(Value::as_array)
                    .cloned()
                    .or_else(|| value.get("contribution").filter(|c| !c.is_null()).map(|c| vec![c.clone()]))
                    .unwrap_or_default();
                let mut got: Vec<String> = list.iter().map(|c| c["id"].as_str().unwrap_or("").to_string()).collect();
                let mut want: Vec<String> =
                    want.as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect();
                got.sort();
                want.sort();
                if got != want {
                    problems.push(format!("contribution ids {got:?} !== {want:?}"));
                }
            }
            if let Some(r) = expect.get("requests") {
                problems.extend(match_requests(&ctx.control.requests(seq).await, r));
            }
            if let Some(min) = expect.get("minSeconds").and_then(Value::as_f64) {
                if seconds < min {
                    problems.push(format!("took {seconds:.2} s, expected >= {min}"));
                }
            }
            if let Some(max) = expect.get("maxSeconds").and_then(Value::as_f64) {
                if seconds > max {
                    problems.push(format!("took {seconds:.2} s, expected <= {max}"));
                }
            }
        }
        if !problems.is_empty() {
            failures.push(format!("{label}:\n    - {}", problems.join("\n    - ")));
            break;
        }
    }

    if failures.is_empty() {
        if let Some(final_expect) = scenario.get("expect").filter(|e| !e.is_null()) {
            let v = vars(&ctx, &unreachable).await;
            let e = substitute(&resolve_const(final_expect), &v);
            let mut problems = Vec::new();
            if let Some(r) = e.get("requests") {
                problems.extend(match_requests(&ctx.control.requests(start_seq).await, r));
            }
            for f in e.get("files").and_then(Value::as_array).cloned().unwrap_or_default() {
                if let Some(glob) = f.get("glob").and_then(Value::as_str) {
                    let n = glob_count(glob);
                    if Some(n as u64) != f["count"].as_u64() {
                        problems.push(format!("{glob}: {n} file(s), expected {}", f["count"]));
                    }
                    continue;
                }
                let path = f["path"].as_str().unwrap();
                let meta = std::fs::metadata(path).ok();
                match (&f["exists"], &meta) {
                    (Value::Bool(true), None) => problems.push(format!("{path}: does not exist")),
                    (Value::Bool(false), Some(_)) => problems.push(format!("{path}: exists but should not")),
                    _ => {}
                }
                let Some(meta) = meta else { continue };
                match f["kind"].as_str() {
                    Some("directory") if !meta.is_dir() => problems.push(format!("{path}: not a directory")),
                    Some("file") if !meta.is_file() => problems.push(format!("{path}: not a file")),
                    _ => {}
                }
                #[cfg(unix)]
                if let Some(mode) = f["mode"].as_str() {
                    use std::os::unix::fs::PermissionsExt;
                    let actual = format!("0{:o}", meta.permissions().mode() & 0o777);
                    if actual != mode {
                        problems.push(format!("{path}: mode {actual}, expected {mode}"));
                    }
                }
                if f.get("json").is_some() || f.get("schema").is_some() {
                    let data: Value = match std::fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()) {
                        Some(d) => d,
                        None => {
                            problems.push(format!("{path}: not valid JSON"));
                            continue;
                        }
                    };
                    if f["schema"] == "storage-file" {
                        problems.extend(validate_storage_file(&data).into_iter().map(|p| format!("{path}: {p}")));
                    }
                    if let Some(m) = f.get("json") {
                        problems.extend(matches(Some(&data), m, "file"));
                    }
                }
            }
            if !problems.is_empty() {
                failures.push(format!("final expectations:\n    - {}", problems.join("\n    - ")));
            }
        }
    }
    drop(ctx);
    assert!(failures.is_empty(), "scenario {id} failed:\n  {}", failures.join("\n  "));
}

fn now_iso() -> String {
    // Same format as the SDK: YYYY-MM-DDTHH:MM:SS.mmmZ (UTC).
    let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64;
    let (secs, millis) = (ms.div_euclid(1000), ms.rem_euclid(1000));
    let (days, sod) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{millis:03}Z", sod / 3600, (sod % 3600) / 60, sod % 60)
}

fn rand_u32() -> u32 {
    use std::hash::{BuildHasher, Hasher};
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
    h.finish() as u32
}
