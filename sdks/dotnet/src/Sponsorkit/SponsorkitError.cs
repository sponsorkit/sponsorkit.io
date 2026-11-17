using System;

namespace Sponsorkit;

/// <summary>
/// The exception type for every error Sponsorkit raises on purpose. <see cref="Code"/> is a stable, machine-readable
/// error code (see <see cref="SponsorkitErrorCodes"/>). The SDK also throws the standard
/// <see cref="ArgumentException"/> and <see cref="ArgumentNullException"/> for invalid arguments, and
/// <see cref="OperationCanceledException"/> when a <see cref="System.Threading.CancellationToken"/> you pass is cancelled
/// (except in sign-in, which throws the <c>cancelled</c> code, and checkout, which returns <see cref="CheckoutStatus.Unknown"/>).
/// </summary>
/// <remarks>
/// <see cref="SponsorkitClient.GetFinancialContributionAsync(System.Threading.CancellationToken)"/> never throws
/// because Sponsorkit or a provider is unreachable: network errors, 5xx and rate limits are reported through
/// <see cref="ContributionResult.Stale"/> instead. Errors are thrown for configuration mistakes and for
/// user-initiated actions (sign-in, checkout) that cannot complete.
/// </remarks>
#pragma warning disable CA1710 // The protocol names this type SponsorkitError in every SDK.
public sealed class SponsorkitError : Exception
#pragma warning restore CA1710
{
    /// <summary>Creates an error with the given code and message.</summary>
    /// <param name="code">One of <see cref="SponsorkitErrorCodes"/>.</param>
    /// <param name="message">A human-readable description.</param>
    /// <param name="innerException">The underlying exception, if any.</param>
    public SponsorkitError(string code, string? message = null, Exception? innerException = null)
        : base(message ?? code, innerException)
    {
        Code = code ?? throw new ArgumentNullException(nameof(code));
    }

    /// <summary>Creates an error that carries a <c>Retry-After</c> delay.</summary>
    /// <param name="code">One of <see cref="SponsorkitErrorCodes"/>.</param>
    /// <param name="message">A human-readable description.</param>
    /// <param name="retryAfter">How long the API asked the caller to wait, or <c>null</c>.</param>
    /// <param name="innerException">The underlying exception, if any.</param>
    public SponsorkitError(string code, string? message, TimeSpan? retryAfter, Exception? innerException)
        : this(code, message, innerException)
    {
        RetryAfter = retryAfter;
    }

    /// <summary>The machine-readable error code, for example <c>invalid_config</c> or <c>access_denied</c>.</summary>
    public string Code { get; }

    /// <summary>
    /// For <c>network_error</c> caused by a rate limit: how long the API asked the caller to wait (its <c>Retry-After</c>
    /// header). <c>null</c> when the API sent none.
    /// </summary>
    public TimeSpan? RetryAfter { get; }
}

/// <summary>The values of <see cref="SponsorkitError.Code"/> (PROTOCOL §7, "SDK error codes").</summary>
public static class SponsorkitErrorCodes
{
    /// <summary>Missing or invalid configuration: no targets, a malformed target, an unknown mock preset, invalid checkout options, or (dev-time check) a target that does not exist.</summary>
    public const string InvalidConfig = "invalid_config";

    /// <summary>Sponsorkit is disabled through <c>SPONSORKIT_DISABLE</c>.</summary>
    public const string Disabled = "disabled";

    /// <summary>Browser only; never thrown by the .NET SDK. Listed for parity with the protocol.</summary>
    public const string PopupBlocked = "popup_blocked";

    /// <summary>The supporter denied access at the provider.</summary>
    public const string AccessDenied = "access_denied";

    /// <summary>The sign-in state expired or could not be verified.</summary>
    public const string InvalidState = "invalid_state";

    /// <summary>The provider failed during sign-in.</summary>
    public const string ProviderError = "provider_error";

    /// <summary>The API rejected the sign-in code exchange (<c>400 invalid_code</c>): the code is malformed or expired, or the PKCE verifier did not match.</summary>
    public const string InvalidCode = "invalid_code";

    /// <summary>Sign-in was abandoned or cancelled through its <see cref="System.Threading.CancellationToken"/>, or no paste-back code was entered.</summary>
    public const string Cancelled = "cancelled";

    /// <summary>Sign-in did not complete within <see cref="SponsorkitOptions.SignInTimeout"/> (default 5 minutes).</summary>
    public const string Timeout = "timeout";

    /// <summary>
    /// During sign-in or <see cref="SponsorkitServer.VerifySessionAsync"/>, the API could not be reached or answered
    /// 5xx, 429 or an unexpected response. <see cref="SponsorkitError.RetryAfter"/> is set when the API sent <c>Retry-After</c>.
    /// </summary>
    public const string NetworkError = "network_error";

    /// <summary>The session token is invalid or expired. Only thrown by <see cref="SponsorkitServer.VerifySessionAsync"/>.</summary>
    public const string SessionInvalid = "session_invalid";

    /// <summary>The session is bound to a different target set. Only thrown by <see cref="SponsorkitServer.VerifySessionAsync"/>.</summary>
    public const string TargetsMismatch = "targets_mismatch";
}
