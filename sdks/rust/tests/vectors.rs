//! Test vectors (sdks/conformance/fixtures/vectors.json) and mock presets.

use std::path::{Path, PathBuf};

use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sponsorkit::{
    CheckoutOptions, ContributionResult, ErrorCode, Frequency, GetOptions, Mock, MockPreset, Options, Provider,
    Sponsorkit, Target, TargetSet, Targets, base64url, code_challenge, mock_result,
};

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../conformance/fixtures")
}

fn fixture(name: &str) -> Value {
    serde_json::from_str(&std::fs::read_to_string(fixtures().join(name)).unwrap()).unwrap()
}

#[test]
fn targets_hash_vectors() {
    let v = fixture("vectors.json");
    for case in v["targetSets"].as_array().unwrap() {
        let input = &case["input"];
        let set = Targets {
            github: input["github"].as_str().map(str::to_owned),
            opencollective: input["opencollective"].as_str().map(str::to_owned),
        }
        .canonical()
        .unwrap();
        assert_eq!(set.param(), case["param"].as_str().unwrap());
        assert_eq!(set.hash(), case["targetsHash"].as_str().unwrap());
        assert_eq!(TargetSet::parse(&set.param()).unwrap(), set);
    }
}

#[test]
fn invalid_target_vectors() {
    let v = fixture("vectors.json");
    for case in v["invalidTargets"].as_array().unwrap() {
        let provider = case["provider"].as_str().unwrap();
        let account = case["account"].as_str().unwrap();
        let err = provider.parse::<Provider>().and_then(|p| Target::new(p, account)).unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidConfig, "{provider}:{account}");
        let err = Target::parse(&format!("{provider}:{account}")).unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidConfig);
    }
    // The constructor rejects them too, before any I/O.
    let err = Sponsorkit::new(Options { github: Some("-bad-".into()), ..Default::default() }).unwrap_err();
    assert_eq!(err.code(), ErrorCode::InvalidConfig);
    let err = Sponsorkit::new(Options::default()).unwrap_err();
    assert_eq!(err.code().as_str(), "invalid_config");
}

#[test]
fn pkce_vectors() {
    let v = fixture("vectors.json");
    for case in v["pkce"].as_array().unwrap() {
        assert_eq!(code_challenge(case["codeVerifier"].as_str().unwrap()), case["codeChallenge"].as_str().unwrap());
    }
}

#[test]
fn contribution_id_vectors() {
    let v = fixture("vectors.json");
    for case in v["contributionIds"].as_array().unwrap() {
        let provider = case["provider"].as_str().unwrap();
        let digest = Sha256::digest(format!("{provider}:{}", case["externalId"].as_str().unwrap()).as_bytes());
        let id = format!("con_{provider}_{}", &base64url(&digest)[..22]);
        assert_eq!(id, case["id"].as_str().unwrap());
    }
}

#[test]
fn embedded_mock_presets_are_identical_to_the_kit() {
    let kit = std::fs::read_to_string(fixtures().join("mock-presets.json")).unwrap();
    assert_eq!(sponsorkit::MOCK_PRESETS_JSON, kit, "src/mock-presets.json must be a byte-for-byte copy");
}

#[test]
fn mock_presets_expand_per_rules() {
    let set = TargetSet::parse("opencollective:sponsorkit,github:octocat").unwrap();
    let presets = fixture("mock-presets.json");
    for p in MockPreset::ALL {
        let r = mock_result(&set, &Mock::Preset(p));
        let raw = &presets["presets"][p.as_str()];
        let signed_in = raw["signedIn"].as_bool().unwrap();
        let v = serde_json::to_value(&r).unwrap();
        assert_eq!(v["signedIn"], json!(signed_in));
        assert_eq!(v["mock"], json!(true));
        assert_eq!(v["disabled"], json!(false));
        assert_eq!(v["fetchedAt"], Value::Null);
        assert_eq!(v["targets"], json!(["github:octocat", "opencollective:sponsorkit"]));
        assert!(v.get("unavailable").is_none());
        if signed_in {
            assert_eq!(
                v["supporter"],
                json!({ "id": "sup_mock", "identities": [{ "provider": "github", "id": "0", "handle": "mock-user", "needsReconnect": false }] })
            );
        } else {
            assert_eq!(v["supporter"], Value::Null);
        }
        // Each contribution is the template with {provider}/{target} replaced.
        let expected: Vec<Value> = raw["contributions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| {
                let s = c.to_string().replace("{provider}", "github").replace("{target}", "github:octocat");
                serde_json::from_str(&s).unwrap()
            })
            .collect();
        assert_eq!(v["contributions"], Value::Array(expected), "{p}");
    }
}

#[tokio::test]
async fn mock_mode_flow_without_io() {
    let dir = Path::new(env!("CARGO_TARGET_TMPDIR")).join(format!("mock-no-io-{}", std::process::id()));
    let sk = Sponsorkit::new(Options {
        opencollective: Some("sponsorkit".into()),
        mock: Some(MockPreset::SignedOut.into()),
        storage_dir: Some(dir.clone()),
        api_base_url: Some("http://127.0.0.1:9".into()),
        env: Some(Default::default()),
        ..Default::default()
    })
    .unwrap();
    assert!(!sk.is_signed_in());
    sk.sign_in(Default::default()).await.unwrap();
    let out = sk
        .open_checkout(CheckoutOptions {
            amount: Some(1500),
            currency: Some("EUR".into()),
            frequency: Some(Frequency::Yearly),
            ..Default::default()
        })
        .await
        .unwrap();
    let c = out.contribution().unwrap();
    assert_eq!(c.id, "con_opencollective_mock_checkout");
    assert_eq!(c.amount.value, 1500);
    let fc: ContributionResult = sk.get_financial_contribution(GetOptions::default()).await.unwrap();
    assert_eq!(fc.active().len(), 1);
    assert_eq!(fc.recurring().len(), 1);
    assert!(fc.one_time().is_empty());
    assert_eq!(fc.by_provider(Provider::OpenCollective).len(), 1);
    assert_eq!(fc.direct().len(), 1);
    sk.sign_out().await.unwrap();
    assert!(!sk.is_signed_in());
    assert!(!dir.exists(), "mock mode must not touch the disk");
}

#[test]
fn disabled_beats_mock_and_still_validates_targets() {
    let env = Some([("SPONSORKIT_DISABLE".to_string(), "TRUE".to_string())].into_iter().collect());
    let err =
        Sponsorkit::new(Options { github: Some("bad-".into()), env: env.clone(), ..Default::default() }).unwrap_err();
    assert_eq!(err.code(), ErrorCode::InvalidConfig);
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        env,
        mock: Some(MockPreset::ActiveMonthly.into()),
        ..Default::default()
    })
    .unwrap();
    assert!(sk.is_disabled());
    assert!(!sk.is_mock());
    // "false" and "0" do not count as set.
    for off in ["0", "false", "FALSE", ""] {
        let env = Some([("SPONSORKIT_DISABLE".to_string(), off.to_string())].into_iter().collect());
        let sk = Sponsorkit::new(Options { github: Some("octocat".into()), env, ..Default::default() }).unwrap();
        assert!(!sk.is_disabled(), "{off:?}");
    }
}

#[test]
fn checkout_url_is_offline_and_canonical() {
    let sk = Sponsorkit::new(Options {
        github: Some(" OctoCat ".into()),
        api_base_url: Some("https://example.test/".into()),
        env: Some(Default::default()),
        ..Default::default()
    })
    .unwrap();
    let url = sk
        .checkout_url(&CheckoutOptions { amount: Some(500), frequency: Some(Frequency::Monthly), ..Default::default() })
        .unwrap();
    assert_eq!(url, "https://example.test/checkout/?targets=github%3Aoctocat&amount=500&frequency=monthly");
}

#[test]
fn checkout_url_uses_the_site_base_url() {
    let url = |api: Option<&str>, site: Option<&str>| {
        Sponsorkit::new(Options {
            github: Some("octocat".into()),
            api_base_url: api.map(Into::into),
            site_base_url: site.map(Into::into),
            env: Some(Default::default()),
            ..Default::default()
        })
        .unwrap()
        .checkout_url(&CheckoutOptions::default())
        .unwrap()
    };
    assert_eq!(url(None, None), "https://sponsorkit.github.io/sponsorkit.io/checkout/?targets=github%3Aoctocat");
    assert_eq!(
        url(Some("https://api.example.test"), Some("https://site.example.test/base/")),
        "https://site.example.test/base/checkout/?targets=github%3Aoctocat"
    );
    // An empty site_base_url is unset: the site defaults to api_base_url.
    assert_eq!(
        url(Some("https://api.example.test"), Some("")),
        "https://api.example.test/checkout/?targets=github%3Aoctocat"
    );
}

#[test]
fn checkout_url_rejects_invalid_options() {
    let sk = Sponsorkit::new(Options {
        github: Some("octocat".into()),
        env: Some(Default::default()),
        ..Default::default()
    })
    .unwrap();
    let bad = [
        CheckoutOptions { provider: Some(sponsorkit::Provider::OpenCollective), ..Default::default() },
        CheckoutOptions { amount: Some(0), ..Default::default() },
        CheckoutOptions { amount: Some(-500), ..Default::default() },
        CheckoutOptions { currency: Some("EURO".into()), ..Default::default() },
        CheckoutOptions { currency: Some(String::new()), ..Default::default() },
    ];
    for o in bad {
        assert_eq!(sk.checkout_url(&o).unwrap_err().code(), ErrorCode::InvalidConfig, "{o:?}");
    }
    assert_eq!("weekly".parse::<Frequency>().unwrap_err().code(), ErrorCode::InvalidConfig);
}

#[test]
fn error_codes_are_canonical() {
    let all = [
        ErrorCode::InvalidConfig,
        ErrorCode::Disabled,
        ErrorCode::PopupBlocked,
        ErrorCode::AccessDenied,
        ErrorCode::InvalidState,
        ErrorCode::ProviderError,
        ErrorCode::InvalidCode,
        ErrorCode::Cancelled,
        ErrorCode::Timeout,
        ErrorCode::NetworkError,
        ErrorCode::SessionInvalid,
        ErrorCode::TargetsMismatch,
    ];
    let wire: Vec<&str> = all.iter().map(|c| c.as_str()).collect();
    assert_eq!(
        wire,
        [
            "invalid_config",
            "disabled",
            "popup_blocked",
            "access_denied",
            "invalid_state",
            "provider_error",
            "invalid_code",
            "cancelled",
            "timeout",
            "network_error",
            "session_invalid",
            "targets_mismatch"
        ]
    );
}

#[test]
fn checkout_outcome_json_shape() {
    let unknown = serde_json::to_value(sponsorkit::CheckoutOutcome::Unknown).unwrap();
    assert_eq!(unknown, json!({ "status": "unknown" }));
}
