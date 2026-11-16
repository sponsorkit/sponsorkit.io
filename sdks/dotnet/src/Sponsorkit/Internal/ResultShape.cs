using System.Collections.Generic;

namespace Sponsorkit.Internal;

/// <summary>
/// Structural check of a deserialized <see cref="ContributionResult"/>. An explicit JSON <c>null</c> overrides the
/// non-null defaults of the model, so a malformed API body or storage file could otherwise hand the caller (or the
/// partial-outage merge) a null list. A result that fails this check is an unexpected response (PROTOCOL §7).
/// </summary>
internal static class ResultShape
{
    public static bool IsValid(ContributionResult? result)
    {
        if (result is null) return false;
        if (!NoNulls(result.Targets)) return false;
        if (!NoNulls(result.Contributions)) return false;
        if (result.Unavailable is not null && !NoNulls(result.Unavailable)) return false;
        if (result.Supporter is { } supporter && !NoNulls(supporter.Identities)) return false;
        foreach (var c in result.Contributions)
        {
            if (c.Id is null || c.Provider is null || c.Sponsor is null || c.Amount is null || c.Flags is null) return false;
            foreach (var flag in c.Flags)
            {
                if (flag is null) return false;
            }
        }
        return true;
    }

    private static bool NoNulls<T>(IReadOnlyList<T>? list)
        where T : class
    {
        if (list is null) return false;
        foreach (var item in list)
        {
            if (item is null) return false;
        }
        return true;
    }
}
