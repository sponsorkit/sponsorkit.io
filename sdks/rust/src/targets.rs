//! Targets and target sets (PROTOCOL §1).
//!
//! A target is an account that receives contributions: `github:<login>` or
//! `opencollective:<slug>`. A target set holds at most one target per provider
//! and has a canonical string form (the *target param*), whose SHA-256 is the
//! *targets hash* used as the local storage key.

use std::fmt;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{Error, Result};

/// A contribution provider.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    /// GitHub Sponsors.
    #[serde(rename = "github")]
    GitHub,
    /// Open Collective.
    #[serde(rename = "opencollective")]
    OpenCollective,
}

impl Provider {
    /// The wire spelling: `"github"` or `"opencollective"`.
    pub fn as_str(self) -> &'static str {
        match self {
            Provider::GitHub => "github",
            Provider::OpenCollective => "opencollective",
        }
    }

    /// Parses `"github"` or `"opencollective"`.
    pub fn parse(s: &str) -> Option<Provider> {
        match s {
            "github" => Some(Provider::GitHub),
            "opencollective" => Some(Provider::OpenCollective),
            _ => None,
        }
    }
}

impl fmt::Display for Provider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for Provider {
    type Err = Error;
    fn from_str(s: &str) -> Result<Self> {
        Provider::parse(s).ok_or_else(|| Error::invalid_config(format!("Unknown provider \"{s}\"")))
    }
}

/// One normalized target.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Target {
    /// The provider.
    pub provider: Provider,
    /// The lowercased, trimmed login or slug.
    pub account: String,
}

impl fmt::Display for Target {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.provider, self.account)
    }
}

fn valid_github_login(a: &str) -> bool {
    // ^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$
    let b = a.as_bytes();
    if b.is_empty() || b.len() > 39 {
        return false;
    }
    let alnum = |c: u8| c.is_ascii_lowercase() || c.is_ascii_digit();
    if !alnum(b[0]) {
        return false;
    }
    for i in 1..b.len() {
        let c = b[i];
        if alnum(c) {
            continue;
        }
        if c == b'-' && i + 1 < b.len() && alnum(b[i + 1]) {
            continue;
        }
        return false;
    }
    true
}

fn valid_oc_slug(a: &str) -> bool {
    // ^[a-z0-9][a-z0-9-]{0,254}$
    let b = a.as_bytes();
    if b.is_empty() || b.len() > 255 {
        return false;
    }
    let alnum = |c: u8| c.is_ascii_lowercase() || c.is_ascii_digit();
    alnum(b[0]) && b[1..].iter().all(|&c| alnum(c) || c == b'-')
}

impl Target {
    /// Normalizes (trim + lowercase) and validates an account for a provider.
    ///
    /// Returns an `invalid_config` error for malformed accounts.
    pub fn new(provider: Provider, account: &str) -> Result<Target> {
        let a = account.trim().to_lowercase();
        let ok = match provider {
            Provider::GitHub => valid_github_login(&a),
            Provider::OpenCollective => valid_oc_slug(&a),
        };
        if !ok {
            return Err(Error::invalid_config(format!("Invalid {provider} account \"{account}\"")));
        }
        Ok(Target { provider, account: a })
    }

    /// Parses `"<provider>:<account>"`.
    pub fn parse(s: &str) -> Result<Target> {
        let (p, a) = s
            .split_once(':')
            .filter(|(p, _)| !p.is_empty())
            .ok_or_else(|| Error::invalid_config(format!("Invalid target \"{s}\"")))?;
        Target::new(p.parse()?, a)
    }
}

/// The accounts to check, as given by the maintainer (`{ github, opencollective }`).
///
/// Used by [`crate::server::verify_session`]; [`crate::Options`] has the same two fields.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Targets {
    /// GitHub Sponsors login (user or organization).
    pub github: Option<String>,
    /// Open Collective collective slug.
    pub opencollective: Option<String>,
}

impl Targets {
    /// A target set with only a GitHub login.
    pub fn github(login: impl Into<String>) -> Self {
        Targets { github: Some(login.into()), opencollective: None }
    }

    /// A target set with only an Open Collective slug.
    pub fn opencollective(slug: impl Into<String>) -> Self {
        Targets { github: None, opencollective: Some(slug.into()) }
    }

    /// Adds (or replaces) the GitHub login.
    pub fn with_github(mut self, login: impl Into<String>) -> Self {
        self.github = Some(login.into());
        self
    }

    /// Adds (or replaces) the Open Collective slug.
    pub fn with_opencollective(mut self, slug: impl Into<String>) -> Self {
        self.opencollective = Some(slug.into());
        self
    }

    /// Validates and canonicalizes this set.
    pub fn canonical(&self) -> Result<TargetSet> {
        let mut out = Vec::new();
        if let Some(g) = self.github.as_deref().filter(|s| !s.is_empty()) {
            out.push(Target::new(Provider::GitHub, g)?);
        }
        if let Some(o) = self.opencollective.as_deref().filter(|s| !s.is_empty()) {
            out.push(Target::new(Provider::OpenCollective, o)?);
        }
        TargetSet::new(out)
    }
}

/// A canonical target set: deduplicated, sorted by string form, non-empty,
/// at most one target per provider.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TargetSet {
    targets: Vec<Target>,
}

impl TargetSet {
    /// Canonicalizes a list of targets.
    pub fn new(targets: Vec<Target>) -> Result<TargetSet> {
        let mut t = targets;
        t.sort_by_key(|x| x.to_string());
        t.dedup();
        if t.is_empty() {
            return Err(Error::invalid_config("At least one target (github or opencollective) is required"));
        }
        if t.windows(2).any(|w| w[0].provider == w[1].provider) {
            return Err(Error::invalid_config("At most one target per provider is supported"));
        }
        Ok(TargetSet { targets: t })
    }

    /// Parses a comma-separated target param.
    pub fn parse(param: &str) -> Result<TargetSet> {
        let t = param.split(',').filter(|s| !s.is_empty()).map(Target::parse).collect::<Result<Vec<_>>>()?;
        TargetSet::new(t)
    }

    /// The targets in canonical order.
    pub fn targets(&self) -> &[Target] {
        &self.targets
    }

    /// The first target in canonical order.
    pub fn first(&self) -> &Target {
        &self.targets[0]
    }

    /// The target for a provider, if configured.
    pub fn get(&self, provider: Provider) -> Option<&Target> {
        self.targets.iter().find(|t| t.provider == provider)
    }

    /// The canonical target strings, e.g. `["github:x", "opencollective:y"]`.
    pub fn strings(&self) -> Vec<String> {
        self.targets.iter().map(|t| t.to_string()).collect()
    }

    /// The target param: canonical strings joined with `,`.
    pub fn param(&self) -> String {
        self.strings().join(",")
    }

    /// `targets_hash`: lowercase hex SHA-256 of the target param.
    pub fn hash(&self) -> String {
        let digest = Sha256::digest(self.param().as_bytes());
        digest.iter().map(|b| format!("{b:02x}")).collect()
    }
}

impl fmt::Display for TargetSet {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.param())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_login_rules() {
        assert!(valid_github_login("a"));
        assert!(valid_github_login("a-b"));
        assert!(!valid_github_login("a--b"));
        assert!(!valid_github_login("-a"));
        assert!(!valid_github_login("a-"));
        assert!(valid_github_login(&"a".repeat(39)));
        assert!(!valid_github_login(&"a".repeat(40)));
    }

    #[test]
    fn parse_roundtrip() {
        let s = TargetSet::parse("opencollective:y,github:X").unwrap();
        assert_eq!(s.param(), "github:x,opencollective:y");
        assert!(TargetSet::parse("github:a,github:b").is_err());
        assert!(TargetSet::parse("").is_err());
    }
}
