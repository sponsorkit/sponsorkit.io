using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit;

/// <summary>How <see cref="SponsorkitClient.SignInAsync(SignInOptions?, CancellationToken)"/> lets the supporter sign in.</summary>
public enum SignInMethod
{
    /// <summary>Loopback when a browser can be opened; paste-back over SSH, without a display, or when opening the browser fails.</summary>
    Auto,

    /// <summary>Open the system browser and receive the code on <c>http://127.0.0.1:&lt;port&gt;/callback</c>.</summary>
    Loopback,

    /// <summary>Print a URL; the supporter opens it on any device and pastes the displayed code back.</summary>
    Paste,
}

/// <summary>Configuration for <see cref="SponsorkitClient"/>. At least one target is required.</summary>
public sealed class SponsorkitOptions
{
    /// <summary>The GitHub login (user or organization) that receives sponsorships.</summary>
    public string? GitHub { get; set; }

    /// <summary>The Open Collective collective slug that receives contributions.</summary>
    public string? OpenCollective { get; set; }

    /// <summary>Your app's name, shown on the consent page as "says it is" (1–64 characters).</summary>
    public string? AppName { get; set; }

    /// <summary>
    /// How long results are served from the local cache without calling the API. Default 1 hour, minimum 60 seconds.
    /// A single call can bypass it with <see cref="SponsorkitClient.GetFinancialContributionAsync(TimeSpan, CancellationToken)"/>.
    /// </summary>
    public TimeSpan CacheTtl { get; set; } = TimeSpan.FromHours(1);

    /// <summary>
    /// Mock mode: no network and no disk access; results carry <c>mock: true</c>. Use a preset name
    /// (<c>"active-monthly"</c> converts implicitly) or <see cref="SponsorkitMock.WithContributions"/>.
    /// The <c>SPONSORKIT_MOCK</c> environment variable selects a preset too; this option wins over it.
    /// </summary>
    public SponsorkitMock? Mock { get; set; }

    /// <summary>
    /// Directory holding one <c>&lt;targets_hash&gt;.json</c> file per target set. Default: <c>$XDG_CONFIG_HOME/sponsorkit</c>
    /// (Linux), <c>~/Library/Application Support/sponsorkit</c> (macOS) or <c>%APPDATA%\sponsorkit</c> (Windows).
    /// </summary>
    public string? StorageDirectory { get; set; }

    /// <summary>A custom storage backend (for example a keychain). Takes precedence over <see cref="StorageDirectory"/>.</summary>
    public ISponsorkitStorage? Storage { get; set; }

    /// <summary>The Sponsorkit origin. Default <c>https://sponsorkit.io</c>; override for self-hosting and tests.</summary>
    public string? ApiBaseUrl { get; set; }

    /// <summary>Which sign-in flow to use. Default <see cref="SignInMethod.Auto"/>.</summary>
    public SignInMethod SignInMethod { get; set; } = SignInMethod.Auto;

    /// <summary>
    /// Opens a URL in a browser. Default: the system browser (<c>open</c>, <c>xdg-open</c> or the shell on Windows).
    /// Throwing makes automatic sign-in fall back to paste-back.
    /// </summary>
    public Func<string, CancellationToken, Task>? OpenBrowser { get; set; }

    /// <summary>
    /// Asks the supporter for the paste-back code. It receives the URL to open. Default: reads a line from standard input.
    /// </summary>
    public Func<string, CancellationToken, Task<string>>? PromptForCode { get; set; }

    /// <summary>
    /// Overrides the environment variables Sponsorkit reads (<c>SPONSORKIT_DISABLE</c>, <c>SPONSORKIT_MOCK</c>,
    /// <c>SPONSORKIT_NO_NAG</c>, <c>CI</c>). When set, the process environment is ignored for these variables.
    /// </summary>
    public IReadOnlyDictionary<string, string>? Environment { get; set; }

    /// <summary>
    /// Forces the dev-time check that the targets exist on or off. Default (<c>null</c>): on when the entry assembly
    /// is a Debug build.
    /// </summary>
    public bool? DevChecks { get; set; }

    /// <summary>How often <see cref="SponsorkitClient.OpenCheckoutAsync"/> polls for a new contribution. Default 60 seconds.</summary>
    public TimeSpan CheckoutPollInterval { get; set; } = TimeSpan.FromSeconds(60);

    /// <summary>The current time, used for cache expiry and nags. Default: <see cref="DateTimeOffset.UtcNow"/>.</summary>
    public Func<DateTimeOffset>? Clock { get; set; }

    /// <summary>The HTTP client to use. Default: a shared internal client.</summary>
    public HttpClient? HttpClient { get; set; }
}

/// <summary>Mock-mode data for <see cref="SponsorkitOptions.Mock"/> (SPEC §7.4).</summary>
public sealed class SponsorkitMock
{
    private SponsorkitMock(string? preset, IReadOnlyList<Contribution>? contributions)
    {
        PresetName = preset;
        Contributions = contributions;
    }

    /// <summary>The built-in preset names.</summary>
    public static IReadOnlyList<string> PresetNames { get; } = new[] { "signed-out", "none", "active-monthly", "one-time", "cancelled", "org" };

    /// <summary>The preset name, or <c>null</c> for custom contributions.</summary>
    public string? PresetName { get; }

    /// <summary>Custom contributions, or <c>null</c> for a preset.</summary>
    public IReadOnlyList<Contribution>? Contributions { get; }

    /// <summary>A built-in preset: <c>signed-out</c>, <c>none</c>, <c>active-monthly</c>, <c>one-time</c>, <c>cancelled</c> or <c>org</c>.</summary>
    /// <param name="name">The preset name. Unknown names make the client constructor throw <c>invalid_config</c>.</param>
    public static SponsorkitMock Preset(string name) => new(name ?? throw new ArgumentNullException(nameof(name)), null);

    /// <summary>Signed in, with exactly these contributions.</summary>
    /// <param name="contributions">The contributions to return.</param>
    public static SponsorkitMock WithContributions(IEnumerable<Contribution> contributions) =>
        new(null, new List<Contribution>(contributions ?? throw new ArgumentNullException(nameof(contributions))));

    /// <summary>Converts a preset name.</summary>
    /// <param name="preset">The preset name.</param>
#pragma warning disable CA2225 // Preset() is the named alternative.
    public static implicit operator SponsorkitMock(string preset) => Preset(preset);
#pragma warning restore CA2225
}

/// <summary>Options for <see cref="SponsorkitClient.SignInAsync(SignInOptions?, CancellationToken)"/>.</summary>
public sealed class SignInOptions
{
    /// <summary>Skip the provider picker: <c>github</c> or <c>opencollective</c>. Also used to add a second identity.</summary>
    public string? Provider { get; set; }

    /// <summary>Overrides <see cref="SponsorkitOptions.SignInMethod"/> for this call.</summary>
    public SignInMethod? Method { get; set; }
}

/// <summary>Options for <see cref="SponsorkitClient.CheckoutUrl"/>.</summary>
public class CheckoutUrlOptions
{
    /// <summary>Preferred provider (<c>github</c> or <c>opencollective</c>).</summary>
    public string? Provider { get; set; }

    /// <summary>Amount in minor units (for example 500 = $5.00).</summary>
    public long? Amount { get; set; }

    /// <summary>ISO 4217 currency code.</summary>
    public string? Currency { get; set; }

    /// <summary><c>one_time</c>, <c>monthly</c> or <c>yearly</c> (see <see cref="Frequencies"/>).</summary>
    public string? Frequency { get; set; }
}

/// <summary>Options for <see cref="SponsorkitClient.OpenCheckoutAsync"/>.</summary>
public sealed class CheckoutOptions : CheckoutUrlOptions
{
    /// <summary>How long to wait for the new contribution. Default 10 minutes.</summary>
    public TimeSpan? Timeout { get; set; }

    /// <summary>Overrides <see cref="SponsorkitOptions.CheckoutPollInterval"/> for this call.</summary>
    public TimeSpan? PollInterval { get; set; }

    /// <summary>Overrides <see cref="SponsorkitOptions.SignInMethod"/> when the supporter must sign in first.</summary>
    public SignInMethod? SignInMethod { get; set; }
}

/// <summary>The outcome of <see cref="SponsorkitClient.OpenCheckoutAsync"/>.</summary>
public enum CheckoutStatus
{
    /// <summary>Nothing new was detected before the timeout or cancellation. The supporter may still have paid.</summary>
    Unknown,

    /// <summary>A new or changed contribution was detected.</summary>
    Contributed,
}

/// <summary>The result of <see cref="SponsorkitClient.OpenCheckoutAsync"/>.</summary>
public sealed class CheckoutResult
{
    internal CheckoutResult(CheckoutStatus status, Contribution? contribution)
    {
        Status = status;
        Contribution = contribution;
    }

    /// <summary>Whether a contribution was detected.</summary>
    public CheckoutStatus Status { get; }

    /// <summary>The new or changed contribution when <see cref="Status"/> is <see cref="CheckoutStatus.Contributed"/>.</summary>
    public Contribution? Contribution { get; }
}
