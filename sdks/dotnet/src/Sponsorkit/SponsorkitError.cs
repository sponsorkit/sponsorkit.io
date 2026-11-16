using System;

namespace Sponsorkit;

/// <summary>
/// The single exception type thrown by Sponsorkit. <see cref="Code"/> is a stable, machine-readable
/// error code (see <see cref="SponsorkitErrorCodes"/>).
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

    /// <summary>The machine-readable error code, for example <c>invalid_config</c> or <c>access_denied</c>.</summary>
    public string Code { get; }
}

/// <summary>The values of <see cref="SponsorkitError.Code"/>.</summary>
public static class SponsorkitErrorCodes
{
    /// <summary>Missing or invalid configuration: no targets, a malformed target, an unknown mock preset, or (dev-time check) a target that does not exist.</summary>
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

    /// <summary>The sign-in code could not be exchanged (malformed, expired, or the PKCE verifier did not match).</summary>
    public const string InvalidCode = "invalid_code";

    /// <summary>The session token is invalid or expired. Only thrown by <see cref="SponsorkitServer.VerifySessionAsync"/>.</summary>
    public const string SessionInvalid = "session_invalid";

    /// <summary>The session is bound to a different target set. Only thrown by <see cref="SponsorkitServer.VerifySessionAsync"/>.</summary>
    public const string TargetsMismatch = "targets_mismatch";

    /// <summary>A sign-in or verification request could not reach the Sponsorkit API.</summary>
    public const string NetworkError = "network_error";

    /// <summary>The Sponsorkit API answered a sign-in or verification request with an unexpected error.</summary>
    public const string Internal = "internal";

    /// <summary>Sign-in did not complete within the time limit (5 minutes for loopback sign-in).</summary>
    public const string Timeout = "timeout";
}
