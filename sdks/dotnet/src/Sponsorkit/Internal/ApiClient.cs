using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Internal;

internal sealed class TokenResponse
{
    [JsonPropertyName("sessionToken")]
    public string SessionToken { get; set; } = "";

    [JsonPropertyName("expiresAt")]
    public string? ExpiresAt { get; set; }

    [JsonPropertyName("result")]
    public ContributionResult? Result { get; set; }
}

internal sealed class Problem
{
    [JsonPropertyName("code")]
    public string? Code { get; set; }

    [JsonPropertyName("detail")]
    public string? Detail { get; set; }

    [JsonPropertyName("title")]
    public string? Title { get; set; }
}

internal sealed class ContributionsResponse
{
    public HttpStatusCode Status { get; set; }

    public ContributionResult? Result { get; set; }

    public string? RenewedSessionToken { get; set; }

    public TimeSpan? RetryAfter { get; set; }

    public Problem? Problem { get; set; }

    public bool IsSuccess => (int)Status >= 200 && (int)Status < 300 && Result is not null;
}

internal sealed class TargetLookup
{
    [JsonPropertyName("targets")]
    public List<TargetLookupItem>? Targets { get; set; }
}

internal sealed class TargetLookupItem
{
    [JsonPropertyName("target")]
    public string Target { get; set; } = "";

    [JsonPropertyName("exists")]
    public bool Exists { get; set; }
}

/// <summary><c>/auth/token</c> answered <c>401 session_invalid</c> for the session an identity was being added to.</summary>
internal sealed class DeadSessionException : Exception
{
    public DeadSessionException()
        : base("The stored session is no longer valid.")
    {
    }
}

/// <summary>The PROTOCOL §3 HTTP API.</summary>
internal sealed class ApiClient
{
    public const string DefaultBaseUrl = "https://sponsorkit.io";
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(30);
    private static readonly Lazy<HttpClient> Shared = new(() => new HttpClient { Timeout = System.Threading.Timeout.InfiniteTimeSpan });
    private static readonly string UserAgent = "sponsorkit-dotnet/" +
        (typeof(ApiClient).Assembly.GetName().Version?.ToString(3) ?? "0.0.0");

    private readonly HttpClient _http;

    public ApiClient(string baseUrl, HttpClient? http)
    {
        BaseUrl = baseUrl;
        _http = http ?? Shared.Value;
    }

    public string BaseUrl { get; }

    /// <summary>Validates and normalizes an <c>apiBaseUrl</c> (origin; trailing slashes removed).</summary>
    public static string NormalizeBaseUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return DefaultBaseUrl;
        var trimmed = value!.Trim().TrimEnd('/');
        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, $"apiBaseUrl must be an absolute http(s) URL, got \"{value}\"");
        return trimmed;
    }

    private HttpRequestMessage Request(HttpMethod method, string path)
    {
        var req = new HttpRequestMessage(method, BaseUrl + path);
        req.Headers.Accept.ParseAdd("application/json");
        req.Headers.TryAddWithoutValidation("User-Agent", UserAgent);
        return req;
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(RequestTimeout);
        try
        {
            return await _http.SendAsync(req, HttpCompletionOption.ResponseContentRead, timeout.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new HttpRequestException("The request to Sponsorkit timed out.");
        }
    }

    private static async Task<string> ReadBodyAsync(HttpResponseMessage res) =>
        res.Content is null ? "" : await res.Content.ReadAsStringAsync().ConfigureAwait(false);

    private static T? TryParse<T>(string body)
        where T : class
    {
        if (string.IsNullOrWhiteSpace(body)) return null;
        try
        {
            return SponsorkitJson.Deserialize<T>(body);
        }
        catch (JsonException)
        {
            return null;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
        catch (FormatException)
        {
            return null;
        }
    }

    /// <summary><c>GET /api/v1/contributions</c>. Throws <see cref="HttpRequestException"/> on transport errors.</summary>
    public async Task<ContributionsResponse> GetContributionsAsync(string sessionToken, CancellationToken cancellationToken)
    {
        using var req = Request(HttpMethod.Get, "/api/v1/contributions");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", sessionToken);
        using var res = await SendAsync(req, cancellationToken).ConfigureAwait(false);
        var body = await ReadBodyAsync(res).ConfigureAwait(false);
        var outcome = new ContributionsResponse { Status = res.StatusCode };
        if (res.IsSuccessStatusCode)
        {
            outcome.Result = TryParse<ContributionResult>(body);
            if (res.Headers.TryGetValues("Sponsorkit-Session", out var values))
            {
                var renewed = values.FirstOrDefault(v => v.StartsWith("sks_", StringComparison.Ordinal));
                if (!string.IsNullOrEmpty(renewed)) outcome.RenewedSessionToken = renewed;
            }
        }
        else
        {
            outcome.Problem = TryParse<Problem>(body);
            outcome.RetryAfter = RetryAfter(res);
        }
        return outcome;
    }

    private static TimeSpan? RetryAfter(HttpResponseMessage res)
    {
        var ra = res.Headers.RetryAfter;
        if (ra is null) return null;
        if (ra.Delta is { } d) return d;
        if (ra.Date is { } date) return date > DateTimeOffset.UtcNow ? date - DateTimeOffset.UtcNow : TimeSpan.Zero;
        return null;
    }

    /// <summary>
    /// <c>POST /api/v1/auth/token</c>. Throws <see cref="SponsorkitError"/> (<c>invalid_code</c> or <c>network_error</c>),
    /// or <see cref="DeadSessionException"/> when the <paramref name="sessionToken"/> being added to was rejected.
    /// </summary>
    public async Task<TokenResponse> ExchangeAsync(string code, string verifier, string? sessionToken, CancellationToken cancellationToken)
    {
        var payload = new Dictionary<string, string> { ["code"] = code, ["codeVerifier"] = verifier };
        if (sessionToken is not null) payload["sessionToken"] = sessionToken;
        using var req = Request(HttpMethod.Post, "/api/v1/auth/token");
        req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        HttpResponseMessage res;
        try
        {
            res = await SendAsync(req, cancellationToken).ConfigureAwait(false);
        }
        catch (HttpRequestException e)
        {
            throw new SponsorkitError(SponsorkitErrorCodes.NetworkError, "Could not reach Sponsorkit to complete sign-in: " + e.Message, e);
        }
        using (res)
        {
            var body = await ReadBodyAsync(res).ConfigureAwait(false);
            if (!res.IsSuccessStatusCode)
            {
                var problem = TryParse<Problem>(body);
                var status = (int)res.StatusCode;
                var detail = problem?.Detail ?? problem?.Title ?? "no details";
                if (status == 400 && problem?.Code == SponsorkitErrorCodes.InvalidCode)
                    throw new SponsorkitError(SponsorkitErrorCodes.InvalidCode, "Sponsorkit rejected the sign-in code: " + detail);
                if (status == 401 && sessionToken is not null) throw new DeadSessionException();
                throw new SponsorkitError(
                    SponsorkitErrorCodes.NetworkError,
                    $"Sign-in failed: Sponsorkit answered {status} ({problem?.Code ?? "no code"}): {detail}",
                    RetryAfter(res),
                    null);
            }
            var token = TryParse<TokenResponse>(body);
            if (token is null || token.Result is null || !token.SessionToken.StartsWith("sks_", StringComparison.Ordinal))
                throw new SponsorkitError(SponsorkitErrorCodes.NetworkError, "Sponsorkit returned an invalid token response.");
            return token;
        }
    }

    /// <summary><c>GET /api/v1/targets</c>. Returns <c>null</c> when the lookup could not be made.</summary>
    public async Task<TargetLookup?> LookupTargetsAsync(TargetSet targets, CancellationToken cancellationToken)
    {
        var query = QueryString.Build(targets.Targets.Select(t => new KeyValuePair<string, string?>(t.Provider, t.Account)));
        using var req = Request(HttpMethod.Get, "/api/v1/targets?" + query);
        try
        {
            using var res = await SendAsync(req, cancellationToken).ConfigureAwait(false);
            if (!res.IsSuccessStatusCode) return null;
            return TryParse<TargetLookup>(await ReadBodyAsync(res).ConfigureAwait(false));
        }
        catch (HttpRequestException)
        {
            return null;
        }
    }
}
