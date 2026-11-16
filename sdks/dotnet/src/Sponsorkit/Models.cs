using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Serialization;
using Sponsorkit.Internal;

namespace Sponsorkit;

/// <summary>Provider identifiers used in targets, identities and contributions.</summary>
public static class Providers
{
    /// <summary>GitHub Sponsors.</summary>
    public const string GitHub = "github";

    /// <summary>Open Collective.</summary>
    public const string OpenCollective = "opencollective";
}

/// <summary>Contribution frequencies (<see cref="Contribution.Frequency"/> and checkout options).</summary>
public static class Frequencies
{
    /// <summary>A single payment.</summary>
    public const string OneTime = "one_time";

    /// <summary>Every month.</summary>
    public const string Monthly = "monthly";

    /// <summary>Every year (Open Collective only).</summary>
    public const string Yearly = "yearly";
}

/// <summary>Values of <see cref="Contribution.Kind"/>.</summary>
public static class ContributionKinds
{
    /// <summary>A recurring contribution.</summary>
    public const string Recurring = "recurring";

    /// <summary>A one-time contribution.</summary>
    public const string OneTime = "one_time";
}

/// <summary>Values of <see cref="Contribution.Status"/> (SPEC §5.2).</summary>
public static class ContributionStatuses
{
    /// <summary>A running recurring contribution.</summary>
    public const string Active = "active";

    /// <summary>A paused recurring contribution.</summary>
    public const string Paused = "paused";

    /// <summary>A recurring contribution that has ended.</summary>
    public const string Cancelled = "cancelled";

    /// <summary>A completed one-time contribution.</summary>
    public const string Paid = "paid";

    /// <summary>The contribution was refunded.</summary>
    public const string Refunded = "refunded";

    /// <summary>The contribution is disputed.</summary>
    public const string Disputed = "disputed";

    /// <summary>The payment failed or was rejected.</summary>
    public const string Failed = "failed";

    /// <summary>The payment is being processed, or the provider reported an unknown status.</summary>
    public const string Pending = "pending";
}

/// <summary>An amount of money in minor units (cents).</summary>
public sealed class Money
{
    /// <summary>The amount in minor units of <see cref="Currency"/> (for example 500 = $5.00).</summary>
    [JsonPropertyName("value")]
    public long Value { get; set; }

    /// <summary>ISO 4217 currency code, uppercase.</summary>
    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "";
}

/// <summary>The provider tier of a contribution.</summary>
public sealed class Tier
{
    /// <summary>The provider's opaque tier id.</summary>
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    /// <summary>The tier name.</summary>
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";
}

/// <summary>Who actually pays for a contribution: the supporter, or an organization they belong to.</summary>
public sealed class SponsorEntity
{
    /// <summary><c>user</c> or <c>organization</c>.</summary>
    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    /// <summary>The provider (see <see cref="Providers"/>).</summary>
    [JsonPropertyName("provider")]
    public string Provider { get; set; } = "";

    /// <summary>The provider's immutable account id.</summary>
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    /// <summary>The account login or slug, when known.</summary>
    [JsonPropertyName("handle")]
    public string? Handle { get; set; }
}

/// <summary>A sponsorship (GitHub) or order (Open Collective) to one of the configured targets (SPEC §5.1).</summary>
public sealed class Contribution
{
    /// <summary>Stable id derived from the provider and the provider's external id.</summary>
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    /// <summary>The provider (see <see cref="Providers"/>).</summary>
    [JsonPropertyName("provider")]
    public string Provider { get; set; } = "";

    /// <summary>The target string, for example <c>github:octocat</c>.</summary>
    [JsonPropertyName("target")]
    public string Target { get; set; } = "";

    /// <summary>Who pays.</summary>
    [JsonPropertyName("sponsor")]
    public SponsorEntity Sponsor { get; set; } = new();

    /// <summary><c>direct</c> or <c>organization</c>.</summary>
    [JsonPropertyName("via")]
    public string Via { get; set; } = "";

    /// <summary><c>recurring</c> or <c>one_time</c> (see <see cref="ContributionKinds"/>).</summary>
    [JsonPropertyName("kind")]
    public string Kind { get; set; } = "";

    /// <summary>See <see cref="Frequencies"/>.</summary>
    [JsonPropertyName("frequency")]
    public string Frequency { get; set; } = "";

    /// <summary>See <see cref="ContributionStatuses"/>.</summary>
    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    /// <summary>The amount per charge, in minor units.</summary>
    [JsonPropertyName("amount")]
    public Money Amount { get; set; } = new();

    /// <summary>The provider tier, when known.</summary>
    [JsonPropertyName("tier")]
    public Tier? Tier { get; set; }

    /// <summary>Flags such as <c>via_patreon</c>.</summary>
    [JsonPropertyName("flags")]
    public IReadOnlyList<string> Flags { get; set; } = Array.Empty<string>();

    /// <summary>Whether the provider marks the contribution private or incognito.</summary>
    [JsonPropertyName("private")]
    public bool IsPrivate { get; set; }

    /// <summary>When the contribution started.</summary>
    [JsonPropertyName("startedAt")]
    [JsonConverter(typeof(IsoDateTimeConverter))]
    public DateTimeOffset? StartedAt { get; set; }

    /// <summary>When the contribution ended, if it has.</summary>
    [JsonPropertyName("endedAt")]
    [JsonConverter(typeof(IsoDateTimeConverter))]
    public DateTimeOffset? EndedAt { get; set; }

    /// <summary>Open Collective only: the last charge.</summary>
    [JsonPropertyName("lastChargedAt")]
    [JsonConverter(typeof(IsoDateTimeConverter))]
    public DateTimeOffset? LastChargedAt { get; set; }

    /// <summary>Open Collective only: the next charge.</summary>
    [JsonPropertyName("nextChargeAt")]
    [JsonConverter(typeof(IsoDateTimeConverter))]
    public DateTimeOffset? NextChargeAt { get; set; }

    /// <summary>Open Collective only: the total contributed so far.</summary>
    [JsonPropertyName("totalContributed")]
    public Money? TotalContributed { get; set; }

    /// <summary><c>true</c> when <see cref="Status"/> is <c>active</c>.</summary>
    [JsonIgnore]
    public bool IsActive => Status == ContributionStatuses.Active;
}

/// <summary>One of the supporter's signed-in provider accounts.</summary>
public sealed class Identity
{
    /// <summary>The provider (see <see cref="Providers"/>).</summary>
    [JsonPropertyName("provider")]
    public string Provider { get; set; } = "";

    /// <summary>The provider's immutable user id.</summary>
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    /// <summary>The login or slug, when known.</summary>
    [JsonPropertyName("handle")]
    public string? Handle { get; set; }

    /// <summary>The provider token expired; call <see cref="SponsorkitClient.SignInAsync(SignInOptions?, System.Threading.CancellationToken)"/> with this provider to reconnect.</summary>
    [JsonPropertyName("needsReconnect")]
    public bool NeedsReconnect { get; set; }
}

/// <summary>The signed-in supporter.</summary>
public sealed class Supporter
{
    /// <summary>Pairwise id (<c>sup_…</c>): stable for the same person and target set, so a backend can key users on it.</summary>
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    /// <summary>The supporter's identities, in sign-in order.</summary>
    [JsonPropertyName("identities")]
    public IReadOnlyList<Identity> Identities { get; set; } = Array.Empty<Identity>();
}

/// <summary>
/// What the current user has contributed to the configured targets (SPEC §5.1). Serializing it with
/// <c>System.Text.Json</c> produces the protocol JSON shape.
/// </summary>
/// <remarks>
/// The helper methods filter <see cref="Contributions"/>; they never sum across providers or currencies.
/// </remarks>
public sealed class ContributionResult
{
    /// <summary>Whether a supporter is signed in.</summary>
    [JsonPropertyName("signedIn")]
    public bool SignedIn { get; set; }

    /// <summary>Whether Sponsorkit is disabled (<c>SPONSORKIT_DISABLE</c>).</summary>
    [JsonPropertyName("disabled")]
    public bool Disabled { get; set; }

    /// <summary>Whether this is mock data.</summary>
    [JsonPropertyName("mock")]
    public bool Mock { get; set; }

    /// <summary>The canonical target strings, for example <c>github:octocat</c>.</summary>
    [JsonPropertyName("targets")]
    public IReadOnlyList<string> Targets { get; set; } = Array.Empty<string>();

    /// <summary>The supporter, or <c>null</c> when signed out (or when nothing could be fetched yet).</summary>
    [JsonPropertyName("supporter")]
    public Supporter? Supporter { get; set; }

    /// <summary>All contributions to the targets, per provider, as reported.</summary>
    [JsonPropertyName("contributions")]
    public IReadOnlyList<Contribution> Contributions { get; set; } = Array.Empty<Contribution>();

    /// <summary>When the data was fetched from the providers.</summary>
    [JsonPropertyName("fetchedAt")]
    [JsonConverter(typeof(IsoDateTimeConverter))]
    public DateTimeOffset? FetchedAt { get; set; }

    /// <summary>Some or all of the data could not be refreshed and comes from the local cache.</summary>
    [JsonPropertyName("stale")]
    public bool Stale { get; set; }

    /// <summary>The whole result was served from the local cache.</summary>
    [JsonPropertyName("fromCache")]
    public bool FromCache { get; set; }

    /// <summary>Providers the API could not query (their contributions are merged from the local cache).</summary>
    [JsonPropertyName("unavailable")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<string>? Unavailable { get; set; }

    /// <summary>Contributions whose status is <c>active</c>.</summary>
    public IReadOnlyList<Contribution> Active() => Contributions.Where(c => c.IsActive).ToList();

    /// <summary>Recurring contributions (any status).</summary>
    public IReadOnlyList<Contribution> Recurring() => Contributions.Where(c => c.Kind == ContributionKinds.Recurring).ToList();

    /// <summary>One-time contributions (any status).</summary>
    public IReadOnlyList<Contribution> OneTime() => Contributions.Where(c => c.Kind == ContributionKinds.OneTime).ToList();

    /// <summary>Contributions made through the given provider (see <see cref="Providers"/>).</summary>
    /// <param name="provider"><c>github</c> or <c>opencollective</c>.</param>
    public IReadOnlyList<Contribution> ByProvider(string provider) => Contributions.Where(c => c.Provider == provider).ToList();

    /// <summary>Contributions paid by the supporter personally (excludes organization sponsorships).</summary>
    public IReadOnlyList<Contribution> Direct() => Contributions.Where(c => c.Via == "direct").ToList();

    internal ContributionResult Clone() => (ContributionResult)MemberwiseClone();
}
