using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Internal;

namespace Sponsorkit;

/// <summary>Options for <see cref="SponsorkitServer.VerifySessionAsync"/>: the target set your backend expects.</summary>
public sealed class VerifySessionOptions
{
    /// <summary>The GitHub login that receives sponsorships.</summary>
    public string? GitHub { get; set; }

    /// <summary>The Open Collective slug that receives contributions.</summary>
    public string? OpenCollective { get; set; }

    /// <summary>The Sponsorkit API origin. Default <c>https://api.sponsorkit.io</c>.</summary>
    public string? ApiBaseUrl { get; set; }

    /// <summary>The HTTP client to use. Default: a shared internal client.</summary>
    public HttpClient? HttpClient { get; set; }

    /// <summary>
    /// The HTTP request timeout. Default 30 seconds; <see cref="TimeSpan.Zero"/> (or <see cref="Timeout.InfiniteTimeSpan"/>)
    /// disables it. A timeout throws <c>network_error</c>; negative values throw <c>invalid_config</c>.
    /// </summary>
    public TimeSpan RequestTimeout { get; set; } = TimeSpan.FromSeconds(30);
}

/// <summary>Backend helpers (SPEC §6.4). They use no local storage.</summary>
public static class SponsorkitServer
{
    /// <summary>
    /// Verifies a session token forwarded by your frontend or app: asks Sponsorkit for the live contribution result
    /// and checks that the session is bound to exactly the expected target set. Sealed tokens cannot be forged, so
    /// the result can be trusted.
    /// </summary>
    /// <param name="sessionToken">The supporter's <c>sks_…</c> session token.</param>
    /// <param name="options">The expected targets.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The live contribution result.</returns>
    /// <exception cref="SponsorkitError">
    /// <c>session_invalid</c> (rejected or malformed token), <c>targets_mismatch</c>, <c>invalid_config</c> (bad expected
    /// targets), or <c>network_error</c> (unreachable, 5xx, 429 or an unexpected response; <see cref="SponsorkitError.RetryAfter"/>
    /// is set when the API sent <c>Retry-After</c>).
    /// </exception>
    /// <exception cref="OperationCanceledException">The <paramref name="cancellationToken"/> was cancelled.</exception>
    public static async Task<ContributionResult> VerifySessionAsync(string sessionToken, VerifySessionOptions options, CancellationToken cancellationToken = default)
    {
        if (options is null) throw new ArgumentNullException(nameof(options));
        var expected = TargetSet.FromOptions(options.GitHub, options.OpenCollective);
        var api = new ApiClient(ApiClient.NormalizeBaseUrl(options.ApiBaseUrl), options.HttpClient, ApiClient.ValidateRequestTimeout(options.RequestTimeout));
        var token = sessionToken?.Trim();
        if (string.IsNullOrEmpty(token) || !SessionTokens.IsWellFormed(token))
            throw new SponsorkitError(SponsorkitErrorCodes.SessionInvalid, "The session token is malformed.");

        ContributionsResponse response;
        try
        {
            response = await api.GetContributionsAsync(token!, cancellationToken).ConfigureAwait(false);
        }
        catch (HttpRequestException e)
        {
            throw new SponsorkitError(SponsorkitErrorCodes.NetworkError, "Could not reach Sponsorkit: " + e.Message, e);
        }
        if (response.Status == HttpStatusCode.Unauthorized)
            throw new SponsorkitError(SponsorkitErrorCodes.SessionInvalid, response.Problem?.Detail ?? "The session token is invalid or expired.");
        if (!response.IsSuccess)
        {
            // 5xx, 429 and anything unexpected (PROTOCOL §7): the API's problem code is only informative here.
            throw new SponsorkitError(
                SponsorkitErrorCodes.NetworkError,
                response.Result is null && (int)response.Status >= 200 && (int)response.Status < 300
                    ? $"Sponsorkit answered {(int)response.Status} with an unexpected response body."
                    : $"Sponsorkit answered {(int)response.Status} ({response.Problem?.Code ?? "no code"}).",
                response.RetryAfter,
                null);
        }

        var result = response.Result!;
        string actual;
        try
        {
            actual = TargetSet.FromTargets(result.Targets.Select(ParseTarget)).Param;
        }
        catch (SponsorkitError)
        {
            actual = string.Join(",", result.Targets);
        }
        if (!string.Equals(actual, expected.Param, StringComparison.Ordinal))
            throw new SponsorkitError(SponsorkitErrorCodes.TargetsMismatch, $"The session is bound to \"{actual}\", expected \"{expected.Param}\".");
        return result;
    }

    private static Target ParseTarget(string s)
    {
        var i = s.IndexOf(':');
        if (i <= 0) throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, $"Invalid target \"{s}\"");
        return TargetSet.Normalize(s.Substring(0, i), s.Substring(i + 1));
    }
}
