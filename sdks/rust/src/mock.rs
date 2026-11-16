//! Mock mode (SPEC §7.4). The presets are embedded byte-for-byte from the
//! conformance kit's `fixtures/mock-presets.json` and expanded with its rules.

use std::fmt;
use std::str::FromStr;
use std::sync::OnceLock;

use serde_json::Value;

use crate::error::{Error, Result};
use crate::targets::{Provider, Target, TargetSet};
use crate::types::{Contribution, ContributionResult, Frequency, Kind, Money, Status, Supporter};

/// The embedded preset file (identical to `sdks/conformance/fixtures/mock-presets.json`).
pub const MOCK_PRESETS_JSON: &str = include_str!("mock-presets.json");

/// A built-in mock preset.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MockPreset {
    /// Signed out.
    SignedOut,
    /// Signed in, no contributions.
    None,
    /// An active $5/month contribution.
    ActiveMonthly,
    /// A paid $25 one-time contribution.
    OneTime,
    /// A cancelled monthly contribution.
    Cancelled,
    /// An active $10/month contribution through an organization.
    Org,
}

impl MockPreset {
    /// All presets.
    pub const ALL: [MockPreset; 6] = [
        MockPreset::SignedOut,
        MockPreset::None,
        MockPreset::ActiveMonthly,
        MockPreset::OneTime,
        MockPreset::Cancelled,
        MockPreset::Org,
    ];

    /// The preset name, e.g. `"active-monthly"`.
    pub fn as_str(self) -> &'static str {
        match self {
            MockPreset::SignedOut => "signed-out",
            MockPreset::None => "none",
            MockPreset::ActiveMonthly => "active-monthly",
            MockPreset::OneTime => "one-time",
            MockPreset::Cancelled => "cancelled",
            MockPreset::Org => "org",
        }
    }
}

impl fmt::Display for MockPreset {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for MockPreset {
    type Err = Error;
    /// Parses a preset name. Unknown names are an `invalid_config` error.
    fn from_str(s: &str) -> Result<Self> {
        MockPreset::ALL
            .into_iter()
            .find(|p| p.as_str() == s)
            .ok_or_else(|| Error::invalid_config(format!("Unknown mock preset \"{s}\"")))
    }
}

/// Mock data for [`crate::Options::mock`].
#[derive(Debug, Clone, PartialEq)]
pub enum Mock {
    /// One of the built-in presets.
    Preset(MockPreset),
    /// Signed in with exactly these contributions (not rewritten).
    Contributions(Vec<Contribution>),
}

impl From<MockPreset> for Mock {
    fn from(p: MockPreset) -> Self {
        Mock::Preset(p)
    }
}

fn presets() -> &'static Value {
    static PRESETS: OnceLock<Value> = OnceLock::new();
    PRESETS.get_or_init(|| serde_json::from_str(MOCK_PRESETS_JSON).expect("embedded mock-presets.json is valid JSON"))
}

fn expand(template: &Value, first: &Target) -> Value {
    let provider = first.provider.as_str();
    let target = first.to_string();
    match template {
        Value::String(s) => Value::String(s.replace("{provider}", provider).replace("{target}", &target)),
        Value::Array(a) => Value::Array(a.iter().map(|v| expand(v, first)).collect()),
        Value::Object(o) => Value::Object(o.iter().map(|(k, v)| (k.clone(), expand(v, first))).collect()),
        other => other.clone(),
    }
}

fn supporter(first: &Target) -> Supporter {
    serde_json::from_value(expand(&presets()["supporter"], first)).expect("embedded supporter template is valid")
}

fn base(
    targets: &TargetSet,
    signed_in: bool,
    supporter: Option<Supporter>,
    contributions: Vec<Contribution>,
) -> ContributionResult {
    ContributionResult {
        signed_in,
        disabled: false,
        mock: true,
        targets: targets.strings(),
        supporter,
        contributions,
        fetched_at: None,
        stale: false,
        from_cache: false,
        unavailable: None,
    }
}

/// Expands a mock configuration into a result (rules 1–4 of mock-presets.json).
pub fn mock_result(targets: &TargetSet, mock: &Mock) -> ContributionResult {
    let first = targets.first();
    match mock {
        Mock::Contributions(c) => base(targets, true, Some(supporter(first)), c.clone()),
        Mock::Preset(p) => {
            let preset = &presets()["presets"][p.as_str()];
            let signed_in = preset["signedIn"].as_bool().unwrap_or(false);
            let contributions = preset["contributions"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .map(|c| {
                            serde_json::from_value(expand(c, first)).expect("embedded preset contribution is valid")
                        })
                        .collect()
                })
                .unwrap_or_default();
            base(targets, signed_in, signed_in.then(|| supporter(first)), contributions)
        }
    }
}

/// The contribution `open_checkout` simulates in mock mode.
pub(crate) fn mock_checkout_contribution(
    targets: &TargetSet,
    provider: Option<Provider>,
    amount: Option<i64>,
    currency: Option<&str>,
    frequency: Option<Frequency>,
) -> Contribution {
    let first = provider.and_then(|p| targets.get(p)).unwrap_or_else(|| targets.first());
    let mut c: Contribution =
        serde_json::from_value(expand(&presets()["checkout"], first)).expect("embedded checkout template is valid");
    let frequency = frequency.unwrap_or(Frequency::Monthly);
    let one_time = frequency == Frequency::OneTime;
    c.amount = Money { value: amount.unwrap_or(500), currency: currency.unwrap_or("USD").to_string() };
    c.frequency = frequency;
    c.kind = if one_time { Kind::OneTime } else { Kind::Recurring };
    c.status = if one_time { Status::Paid } else { Status::Active };
    c
}

/// In-memory mock state of one SDK instance.
#[derive(Debug, Clone)]
pub(crate) struct MockState {
    pub signed_in: bool,
    pub contributions: Vec<Contribution>,
}

impl MockState {
    pub fn new(targets: &TargetSet, mock: &Mock) -> MockState {
        let r = mock_result(targets, mock);
        MockState { signed_in: r.signed_in, contributions: r.contributions }
    }

    pub fn result(&self, targets: &TargetSet) -> ContributionResult {
        if self.signed_in {
            mock_result(targets, &Mock::Contributions(self.contributions.clone()))
        } else {
            mock_result(targets, &Mock::Preset(MockPreset::SignedOut))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_presets_expand() {
        let t = TargetSet::parse("github:octocat,opencollective:x").unwrap();
        for p in MockPreset::ALL {
            let r = mock_result(&t, &Mock::Preset(p));
            assert!(r.mock);
            for c in &r.contributions {
                assert_eq!(c.target, "github:octocat");
                assert!(c.id.starts_with("con_github_mock_"));
            }
        }
        assert!("platinum".parse::<MockPreset>().is_err());
    }
}
