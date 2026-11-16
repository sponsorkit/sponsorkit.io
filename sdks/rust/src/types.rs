//! The data model (SPEC §5.1), identical in every Sponsorkit SDK.
//!
//! All types serialize to the wire JSON with camelCase field names, so
//! `serde_json::to_value(&result)` gives exactly what the HTTP API returns.

use std::fmt;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::targets::Provider;

macro_rules! open_enum {
    (
        $(#[$meta:meta])*
        pub enum $name:ident { $( $(#[$vmeta:meta])* $variant:ident => $wire:literal ),+ $(,)? }
    ) => {
        $(#[$meta])*
        #[derive(Debug, Clone, PartialEq, Eq, Hash)]
        #[non_exhaustive]
        pub enum $name {
            $( $(#[$vmeta])* $variant, )+
            /// A value this version of the SDK does not know yet (kept verbatim).
            Other(String),
        }

        impl $name {
            /// The wire spelling.
            pub fn as_str(&self) -> &str {
                match self {
                    $( $name::$variant => $wire, )+
                    $name::Other(s) => s.as_str(),
                }
            }
        }

        impl From<&str> for $name {
            fn from(s: &str) -> Self {
                match s {
                    $( $wire => $name::$variant, )+
                    other => $name::Other(other.to_string()),
                }
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(self.as_str())
            }
        }

        impl Serialize for $name {
            fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
                s.serialize_str(self.as_str())
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
                let s = String::deserialize(d)?;
                Ok($name::from(s.as_str()))
            }
        }
    };
}

open_enum! {
    /// Contribution status (SPEC §5.2).
    pub enum Status {
        /// A running recurring contribution.
        Active => "active",
        /// A paused recurring contribution.
        Paused => "paused",
        /// A cancelled or expired recurring contribution.
        Cancelled => "cancelled",
        /// A completed one-time contribution.
        Paid => "paid",
        /// Refunded.
        Refunded => "refunded",
        /// Disputed.
        Disputed => "disputed",
        /// Failed or rejected.
        Failed => "failed",
        /// Not completed yet.
        Pending => "pending",
    }
}

open_enum! {
    /// Contribution flags.
    pub enum Flag {
        /// A GitHub sponsorship paid through Patreon.
        ViaPatreon => "via_patreon",
    }
}

/// How often a contribution is charged.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Frequency {
    /// A single payment.
    OneTime,
    /// Every month.
    Monthly,
    /// Every year (Open Collective only).
    Yearly,
}

impl Frequency {
    /// The wire spelling: `one_time`, `monthly` or `yearly`.
    pub fn as_str(self) -> &'static str {
        match self {
            Frequency::OneTime => "one_time",
            Frequency::Monthly => "monthly",
            Frequency::Yearly => "yearly",
        }
    }
}

impl fmt::Display for Frequency {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for Frequency {
    type Err = crate::Error;
    fn from_str(s: &str) -> crate::Result<Self> {
        match s {
            "one_time" => Ok(Frequency::OneTime),
            "monthly" => Ok(Frequency::Monthly),
            "yearly" => Ok(Frequency::Yearly),
            _ => Err(crate::Error::invalid_config(format!("Unknown frequency \"{s}\""))),
        }
    }
}

/// Recurring or one-time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    /// Charged repeatedly.
    Recurring,
    /// Charged once.
    OneTime,
}

/// Whether the supporter paid directly or through an organization (SPEC §5.5).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Via {
    /// Paid by the signed-in user.
    Direct,
    /// Paid by an organization the user belongs to or administers.
    Organization,
}

/// The type of a sponsor entity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SponsorType {
    /// A user account.
    User,
    /// An organization or collective.
    Organization,
}

/// An amount of money in minor units (cents).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Money {
    /// Minor units, e.g. `500` for $5.00.
    pub value: i64,
    /// ISO 4217 code, uppercase.
    pub currency: String,
}

/// Who actually pays.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SponsorEntity {
    /// User or organization.
    #[serde(rename = "type")]
    pub kind: SponsorType,
    /// The provider of this account.
    pub provider: Provider,
    /// Immutable provider id.
    pub id: String,
    /// Login or slug, if known.
    pub handle: Option<String>,
}

/// A tier reference on a contribution.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Tier {
    /// Provider tier id.
    pub id: String,
    /// Tier name.
    pub name: String,
}

/// One sponsorship (GitHub) or order (Open Collective), normalized.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contribution {
    /// Stable id: `con_<provider>_<22 chars>`.
    pub id: String,
    /// The provider.
    pub provider: Provider,
    /// The target string, e.g. `github:octocat`.
    pub target: String,
    /// Who pays.
    pub sponsor: SponsorEntity,
    /// Direct or through an organization.
    pub via: Via,
    /// Recurring or one-time.
    pub kind: Kind,
    /// Charge frequency.
    pub frequency: Frequency,
    /// Status.
    pub status: Status,
    /// Amount per charge. GitHub hides some amounts; they are `0 USD` with `tier: None`.
    pub amount: Money,
    /// Tier, if any.
    pub tier: Option<Tier>,
    /// Flags such as `via_patreon`.
    pub flags: Vec<Flag>,
    /// Whether the provider marks it private / incognito.
    pub private: bool,
    /// ISO-8601 start time.
    pub started_at: Option<String>,
    /// ISO-8601 end time.
    pub ended_at: Option<String>,
    /// Last charge (Open Collective only).
    pub last_charged_at: Option<String>,
    /// Next charge (Open Collective only).
    pub next_charge_at: Option<String>,
    /// Total contributed so far (Open Collective only).
    pub total_contributed: Option<Money>,
}

impl Contribution {
    /// `status == active`.
    pub fn is_active(&self) -> bool {
        self.status == Status::Active
    }
}

/// A provider identity of the signed-in supporter.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    /// The provider.
    pub provider: Provider,
    /// Immutable provider user id.
    pub id: String,
    /// Login or slug.
    pub handle: Option<String>,
    /// The provider token expired; call `sign_in` with this provider again.
    pub needs_reconnect: bool,
}

/// The signed-in supporter.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Supporter {
    /// Pairwise id (`sup_…`), stable per target set and first sign-in identity.
    pub id: String,
    /// The identities in the session.
    pub identities: Vec<Identity>,
}

/// The result of [`crate::Sponsorkit::get_financial_contribution`] (SPEC §5.1).
///
/// Helpers filter `contributions`; they never sum across providers or currencies.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContributionResult {
    /// A supporter is signed in.
    pub signed_in: bool,
    /// Sponsorkit is disabled (`SPONSORKIT_DISABLE`).
    pub disabled: bool,
    /// This is mock data.
    pub mock: bool,
    /// The canonical target strings.
    pub targets: Vec<String>,
    /// The supporter, when signed in and known.
    pub supporter: Option<Supporter>,
    /// The contributions to the targets.
    pub contributions: Vec<Contribution>,
    /// When the data was fetched from the providers (ISO-8601).
    pub fetched_at: Option<String>,
    /// Some data may be outdated: a provider could not be reached and its data
    /// (if any) comes from the local cache.
    pub stale: bool,
    /// The whole result was served from the local cache.
    pub from_cache: bool,
    /// Providers that could not be queried (API only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unavailable: Option<Vec<Provider>>,
}

impl ContributionResult {
    /// Contributions with status `active`.
    pub fn active(&self) -> Vec<&Contribution> {
        self.contributions.iter().filter(|c| c.status == Status::Active).collect()
    }

    /// Recurring contributions (any status).
    pub fn recurring(&self) -> Vec<&Contribution> {
        self.contributions.iter().filter(|c| c.kind == Kind::Recurring).collect()
    }

    /// One-time contributions (any status).
    pub fn one_time(&self) -> Vec<&Contribution> {
        self.contributions.iter().filter(|c| c.kind == Kind::OneTime).collect()
    }

    /// Contributions through one provider.
    pub fn by_provider(&self, provider: Provider) -> Vec<&Contribution> {
        self.contributions.iter().filter(|c| c.provider == provider).collect()
    }

    /// Contributions paid directly by the supporter (not through an organization).
    pub fn direct(&self) -> Vec<&Contribution> {
        self.contributions.iter().filter(|c| c.via == Via::Direct).collect()
    }

    pub(crate) fn empty(targets: Vec<String>) -> Self {
        ContributionResult {
            signed_in: false,
            disabled: false,
            mock: false,
            targets,
            supporter: None,
            contributions: Vec::new(),
            fetched_at: None,
            stale: false,
            from_cache: false,
            unavailable: None,
        }
    }
}

/// The outcome of [`crate::Sponsorkit::open_checkout`].
///
/// Serializes as `{"status":"contributed","contribution":{…}}` or `{"status":"unknown"}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum CheckoutOutcome {
    /// A new or changed contribution was detected.
    Contributed {
        /// The new or changed contribution.
        contribution: Box<Contribution>,
    },
    /// Nothing was detected before the timeout or cancellation.
    Unknown,
}

impl CheckoutOutcome {
    /// The detected contribution, if any.
    pub fn contribution(&self) -> Option<&Contribution> {
        match self {
            CheckoutOutcome::Contributed { contribution } => Some(contribution),
            CheckoutOutcome::Unknown => None,
        }
    }
}

/// `{ sessionToken, expiresAt, result }` from `POST /api/v1/auth/token`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TokenResponse {
    pub session_token: String,
    #[allow(dead_code)]
    pub expires_at: String,
    pub result: ContributionResult,
}

/// application/problem+json body.
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct Problem {
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
}
