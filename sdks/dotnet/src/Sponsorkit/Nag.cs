using System;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;

namespace Sponsorkit;

/// <summary>Options for <see cref="SponsorkitClient.Nag"/>.</summary>
public sealed class NagOptions
{
    /// <summary>Creates nag options.</summary>
    /// <param name="id">A stable id for this nag, for example your app's name. Run counters are kept per id.</param>
    public NagOptions(string id)
    {
        if (string.IsNullOrEmpty(id)) throw new ArgumentException("A nag id is required.", nameof(id));
        Id = id;
    }

    /// <summary>The nag id.</summary>
    public string Id { get; }

    /// <summary>The nag is due once the app has run this many times since it was last shown. Default 10.</summary>
    public int Every { get; set; } = 10;

    /// <summary>The nag is also due once this much time has passed since it was last shown (never before the first <c>Shown()</c>).</summary>
    public TimeSpan? OrEvery { get; set; }

    /// <summary>Parses an ISO-8601 duration such as <c>P7D</c> or <c>PT12H</c>.</summary>
    /// <param name="isoDuration">The duration.</param>
    /// <returns>The duration as a <see cref="TimeSpan"/>.</returns>
    /// <exception cref="SponsorkitError"><c>invalid_config</c> when the value is not an ISO-8601 duration.</exception>
    public static TimeSpan ParseDuration(string isoDuration)
    {
        try
        {
            return XmlConvert.ToTimeSpan(isoDuration?.Trim() ?? "");
        }
        catch (FormatException e)
        {
            throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, $"Invalid ISO-8601 duration \"{isoDuration}\"", e);
        }
        catch (OverflowException e)
        {
            throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, $"Invalid ISO-8601 duration \"{isoDuration}\"", e);
        }
    }
}

/// <summary>
/// Decides when to show a "please support this project" message (SPEC §7.5). Sponsorkit never shows anything
/// itself and never signs in implicitly.
/// </summary>
/// <example>
/// <code>
/// var nag = sk.Nag(new NagOptions("my-cli") { Every = 10, OrEvery = TimeSpan.FromDays(7) });
/// if (await nag.DueAsync(fc =&gt; fc.Active().Count == 0))
/// {
///     Console.Error.WriteLine($"Enjoying my-cli? Support it: {sk.CheckoutUrl(new CheckoutUrlOptions { Frequency = Frequencies.Monthly })}");
///     nag.Shown();
/// }
/// </code>
/// </example>
public sealed class SponsorkitNag
{
    private readonly SponsorkitClient _client;
    private readonly NagOptions _options;

    internal SponsorkitNag(SponsorkitClient client, NagOptions options)
    {
        _client = client;
        _options = options;
    }

    /// <summary>
    /// Counts this run (once per process per id, even when the predicate is false) and returns
    /// <c>predicate(result) &amp;&amp; (runs &gt;= Every || timeSinceLastShown &gt;= OrEvery)</c>.
    /// </summary>
    /// <remarks>
    /// Always <c>false</c> when <c>SPONSORKIT_DISABLE</c> is set. Unless <paramref name="force"/> is true, also
    /// <c>false</c> when <c>SPONSORKIT_NO_NAG</c> or <c>CI</c> is set, or when stdout or stderr is not a terminal.
    /// </remarks>
    /// <param name="predicate">Your rule, given the current contribution result (served from the cache when fresh).</param>
    /// <param name="force">Bypass the terminal, <c>CI</c> and <c>SPONSORKIT_NO_NAG</c> checks.</param>
    /// <param name="cancellationToken">Cancels the contribution lookup.</param>
    /// <returns>Whether to show the nag now.</returns>
    public async Task<bool> DueAsync(Func<ContributionResult, bool> predicate, bool force = false, CancellationToken cancellationToken = default)
    {
        if (predicate is null) throw new ArgumentNullException(nameof(predicate));
        if (_client.IsDisabled) return false;
        _client.CountNagRun(_options.Id);
        if (!force && _client.NagSuppressedByEnvironment()) return false;
        var result = await _client.GetFinancialContributionAsync(cancellationToken).ConfigureAwait(false);
        if (!predicate(result)) return false;
        var state = _client.ReadNag(_options.Id);
        if (state.Runs >= _options.Every) return true;
        return _options.OrEvery is { } orEvery && state.LastShown is { } last && _client.CurrentTime() - last >= orEvery;
    }

    /// <summary>Records that the nag was shown: resets the run counter and the <c>OrEvery</c> timer.</summary>
    public void Shown() => _client.MarkNagShown(_options.Id);
}
