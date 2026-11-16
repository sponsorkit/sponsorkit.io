using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Sponsorkit.Internal;

/// <summary>One target: a provider and a normalized (trimmed, lowercased) account.</summary>
internal readonly struct Target
{
    public Target(string provider, string account)
    {
        Provider = provider;
        Account = account;
    }

    public string Provider { get; }

    public string Account { get; }

    public override string ToString() => Provider + ":" + Account;
}

/// <summary>A canonical target set (PROTOCOL §1).</summary>
internal sealed class TargetSet
{
    private static readonly Regex GitHubLogin = new("^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}\\z", RegexOptions.CultureInvariant);
    private static readonly Regex OpenCollectiveSlug = new("^[a-z0-9][a-z0-9-]{0,254}\\z", RegexOptions.CultureInvariant);

    private TargetSet(IReadOnlyList<Target> targets)
    {
        Targets = targets;
        Strings = targets.Select(t => t.ToString()).ToList();
        Param = string.Join(",", Strings);
        Hash = Sha256Hex(Param);
    }

    public IReadOnlyList<Target> Targets { get; }

    /// <summary>Canonical target strings, e.g. <c>github:octocat</c>.</summary>
    public IReadOnlyList<string> Strings { get; }

    /// <summary>The target param: canonical strings joined with <c>,</c>.</summary>
    public string Param { get; }

    /// <summary>Lowercase hex SHA-256 of the UTF-8 target param.</summary>
    public string Hash { get; }

    public Target First => Targets[0];

    /// <summary>Normalizes and validates one target. Throws <see cref="SponsorkitError"/> (invalid_config).</summary>
    public static Target Normalize(string provider, string account)
    {
        if (account is null) throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, $"Invalid {provider} account (null)");
        var a = account.Trim().ToLowerInvariant();
        var valid = provider switch
        {
            Providers.GitHub => GitHubLogin.IsMatch(a),
            Providers.OpenCollective => OpenCollectiveSlug.IsMatch(a),
            _ => throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, $"Unknown provider \"{provider}\""),
        };
        if (!valid) throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, $"Invalid {provider} account \"{account}\"");
        return new Target(provider, a);
    }

    /// <summary>Builds the canonical set from SDK options. Null or empty values are ignored.</summary>
    public static TargetSet FromOptions(string? github, string? openCollective)
    {
        var list = new List<Target>();
        if (!string.IsNullOrEmpty(github)) list.Add(Normalize(Providers.GitHub, github!));
        if (!string.IsNullOrEmpty(openCollective)) list.Add(Normalize(Providers.OpenCollective, openCollective!));
        return FromTargets(list);
    }

    public static TargetSet FromTargets(IEnumerable<Target> targets)
    {
        var unique = new SortedDictionary<string, Target>(StringComparer.Ordinal);
        foreach (var t in targets) unique[t.ToString()] = t;
        if (unique.Count == 0)
            throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, "At least one target (GitHub login or Open Collective slug) is required");
        var sorted = unique.Values.ToList();
        if (sorted.Select(t => t.Provider).Distinct(StringComparer.Ordinal).Count() != sorted.Count)
            throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, "At most one target per provider is supported");
        return new TargetSet(sorted);
    }

    public bool HasProvider(string provider) => Targets.Any(t => t.Provider == provider);

    internal static string Sha256Hex(string s)
    {
        using var sha = SHA256.Create();
        var digest = sha.ComputeHash(Encoding.UTF8.GetBytes(s));
        var sb = new StringBuilder(digest.Length * 2);
        foreach (var b in digest) sb.Append(b.ToString("x2", System.Globalization.CultureInfo.InvariantCulture));
        return sb.ToString();
    }
}

/// <summary>PKCE S256 helpers (PROTOCOL §2).</summary>
internal static class Pkce
{
    public static string CreateVerifier()
    {
        var bytes = new byte[32];
        using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
        return Base64Url(bytes);
    }

    public static string Challenge(string verifier)
    {
        using var sha = SHA256.Create();
        return Base64Url(sha.ComputeHash(Encoding.ASCII.GetBytes(verifier)));
    }

    public static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string RandomSuffix()
    {
        var bytes = new byte[6];
        using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
        return Base64Url(bytes);
    }
}
