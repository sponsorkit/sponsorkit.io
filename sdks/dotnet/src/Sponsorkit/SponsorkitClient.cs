using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Internal;

namespace Sponsorkit;

/// <summary>
/// The Sponsorkit client: reports what the current user has contributed to your GitHub Sponsors / Open Collective
/// accounts, sends them to contribute, and helps you nag politely.
/// </summary>
/// <example>
/// <code>
/// var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", AppName = "my-cli" });
/// var fc = await sk.GetFinancialContributionAsync();
/// if (fc.SignedIn &amp;&amp; fc.Active().Count == 0) Console.Error.WriteLine($"Support my-cli: {sk.CheckoutUrl()}");
/// </code>
/// </example>
/// <remarks>
/// Instances are thread-safe. Several instances (and several processes) may share a storage directory.
/// </remarks>
public sealed class SponsorkitClient
{
    private static readonly TimeSpan DefaultCheckoutTimeout = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan MinCacheTtl = TimeSpan.FromSeconds(60);

    // Per-process memo state (PROTOCOL §7 `restart`), cleared by ResetProcessState().
    private static readonly ConcurrentDictionary<string, Lazy<Task>> DevCheckMemo = new(StringComparer.Ordinal);
    private static readonly ConcurrentDictionary<string, DateTimeOffset> RetryUntil = new(StringComparer.Ordinal);
    private static readonly ConcurrentDictionary<string, byte> NagRunsCounted = new(StringComparer.Ordinal);

    private readonly SponsorkitOptions _options;
    private readonly TargetSet _targets;
    private readonly EnvReader _env;
    private readonly ApiClient _api;
    private readonly StateStore? _store;
    private readonly ISponsorkitStorage? _storage;
    private readonly bool _devChecks;
    private readonly TimeSpan _cacheTtl;
    private readonly TimeSpan _signInTimeout;
    private readonly bool? _interactive;
    private readonly string? _appName;
    private readonly object _mockLock = new();
    private readonly SponsorkitMock? _mock;
    private bool _mockSignedIn;
    private List<Contribution> _mockContributions = new();
    private readonly HashSet<string> _mockNagRunsCounted = new(StringComparer.Ordinal);

    /// <summary>Creates a client. Validates the configuration synchronously and performs no I/O.</summary>
    /// <param name="options">The configuration. At least one of <see cref="SponsorkitOptions.GitHub"/> and <see cref="SponsorkitOptions.OpenCollective"/> is required.</param>
    /// <exception cref="SponsorkitError"><c>invalid_config</c>: no targets, a malformed target, a malformed <c>apiBaseUrl</c> or <c>appName</c>, a non-positive <c>SignInTimeout</c>, a negative <c>RequestTimeout</c>, or an unknown mock preset.</exception>
    /// <exception cref="ArgumentNullException"><paramref name="options"/> is <see langword="null"/>.</exception>
    public SponsorkitClient(SponsorkitOptions options)
    {
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _targets = TargetSet.FromOptions(options.GitHub, options.OpenCollective);
        _api = new ApiClient(ApiClient.NormalizeBaseUrl(options.ApiBaseUrl), options.HttpClient, ApiClient.ValidateRequestTimeout(options.RequestTimeout));
        if (!string.IsNullOrEmpty(options.AppName))
        {
            _appName = options.AppName!.Trim();
            if (_appName.Length is 0 or > 64)
                throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, "appName must be 1-64 characters");
        }
        _env = new EnvReader(options.Environment);
        IsDisabled = _env.IsSet("SPONSORKIT_DISABLE");

        var envMock = _env.Get("SPONSORKIT_MOCK");
        var mock = options.Mock ?? (EnvReader.IsTruthy(envMock) ? SponsorkitMock.Preset(envMock!.Trim()) : null);
        if (mock?.PresetName is { } preset && !MockPresets.IsPreset(preset))
            throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, $"Unknown mock preset \"{preset}\". Use one of: {string.Join(", ", SponsorkitMock.PresetNames)}");

        _cacheTtl = options.CacheTtl < MinCacheTtl ? MinCacheTtl : options.CacheTtl;
        _devChecks = options.DevChecks ?? _env.IsSet("SPONSORKIT_DEV_CHECKS");
        _interactive = options.Interactive;
        if (options.SignInTimeout != Timeout.InfiniteTimeSpan && options.SignInTimeout <= TimeSpan.Zero)
            throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, "signInTimeout must be positive");
        _signInTimeout = options.SignInTimeout.TotalMilliseconds > int.MaxValue ? Timeout.InfiniteTimeSpan : options.SignInTimeout;

        if (IsDisabled) return; // No network and no disk access at all.

        if (mock is not null)
        {
            _mock = mock;
            var initial = MockPresets.Result(_targets, mock);
            _mockSignedIn = initial.SignedIn;
            _mockContributions = initial.Contributions.ToList();
            _storage = new MemoryStorage();
        }
        else
        {
            // PROTOCOL §7.0: without a per-user config directory, keep state in memory (never in the working directory).
            var directory = string.IsNullOrEmpty(options.StorageDirectory) ? FileStorage.DefaultDirectory() : options.StorageDirectory;
            _storage = options.Storage ?? (directory is null ? new MemoryStorage() : new FileStorage(directory));
        }
        _store = new StateStore(_storage, _targets.Hash);
    }

    /// <summary>The canonical target strings, for example <c>github:octocat</c>.</summary>
    public IReadOnlyList<string> Targets => _targets.Strings;

    /// <summary>The <c>targets_hash</c> that keys this target set's local storage.</summary>
    public string TargetsHash => _targets.Hash;

    /// <summary>Whether Sponsorkit is disabled through <c>SPONSORKIT_DISABLE</c>.</summary>
    public bool IsDisabled { get; }

    /// <summary>Whether mock mode is active.</summary>
    public bool IsMock => _mock is not null;

    /// <summary>The Sponsorkit origin in use.</summary>
    public string ApiBaseUrl => _api.BaseUrl;

    /// <summary>
    /// Forgets per-process state: which nag runs were already counted, the dev-time target check, and any
    /// <c>Retry-After</c> backoff. Call it to simulate a new run of the app in tests.
    /// </summary>
    public static void ResetProcessState()
    {
        DevCheckMemo.Clear();
        RetryUntil.Clear();
        NagRunsCounted.Clear();
    }

    private DateTimeOffset Now() => _options.Clock?.Invoke() ?? DateTimeOffset.UtcNow;

    // ------------------------------------------------------------------ results

    private ContributionResult EmptyResult(bool signedIn = false, bool disabled = false, bool stale = false) => new()
    {
        SignedIn = signedIn,
        Disabled = disabled,
        Mock = false,
        Targets = _targets.Strings.ToList(),
        Supporter = null,
        Contributions = new List<Contribution>(),
        FetchedAt = null,
        Stale = stale,
        FromCache = false,
    };

    private ContributionResult MockNow()
    {
        lock (_mockLock)
        {
            return _mockSignedIn
                ? MockPresets.Build(_targets, true, _mockContributions.ToList())
                : MockPresets.Build(_targets, false, new List<Contribution>());
        }
    }

    /// <summary>Whether a supporter is signed in (a session token is stored). Performs no network access.</summary>
    public bool IsSignedIn()
    {
        if (IsDisabled) return false;
        if (_mock is not null)
        {
            lock (_mockLock) return _mockSignedIn;
        }
        return _store!.Load().SessionToken is not null;
    }

    /// <summary>
    /// Returns what the signed-in supporter has contributed to the targets, served from the local cache when it is
    /// younger than <see cref="SponsorkitOptions.CacheTtl"/>.
    /// </summary>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>
    /// The result. When signed out it has <c>SignedIn: false</c> and no network call is made. When the API is
    /// unreachable, failing or rate limited, the cached result is returned with <c>Stale: true</c> (or an empty
    /// signed-in result if nothing is cached). This method never throws for network or server problems.
    /// </returns>
    /// <exception cref="SponsorkitError"><c>invalid_config</c> from the dev-time target existence check.</exception>
    /// <exception cref="OperationCanceledException">The <paramref name="cancellationToken"/> was cancelled.</exception>
    public Task<ContributionResult> GetFinancialContributionAsync(CancellationToken cancellationToken = default) =>
        GetCoreAsync(_cacheTtl, cancellationToken);

    /// <summary>
    /// Like <see cref="GetFinancialContributionAsync(CancellationToken)"/>, with a per-call cache TTL.
    /// <see cref="TimeSpan.Zero"/> always asks the API (unless a <c>Retry-After</c> backoff is in force).
    /// </summary>
    /// <param name="cacheTtl">The maximum age of a cached result to serve.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The result; see <see cref="GetFinancialContributionAsync(CancellationToken)"/>.</returns>
    public Task<ContributionResult> GetFinancialContributionAsync(TimeSpan cacheTtl, CancellationToken cancellationToken = default) =>
        GetCoreAsync(cacheTtl < TimeSpan.Zero ? TimeSpan.Zero : cacheTtl, cancellationToken);

    private async Task<ContributionResult> GetCoreAsync(TimeSpan ttl, CancellationToken cancellationToken)
    {
        if (IsDisabled) return EmptyResult(disabled: true);
        if (_mock is not null) return MockNow();
        await DevCheckAsync(cancellationToken).ConfigureAwait(false);

        var file = _store!.Load();
        var token = file.SessionToken;
        if (token is null) return EmptyResult();

        var cache = file.Cache;
        var now = Now();
        if (cache is not null && ttl > TimeSpan.Zero && now - cache.StoredAt!.Value < ttl)
        {
            var hit = cache.Result!.Clone();
            hit.FromCache = true;
            return hit;
        }

        ContributionResult Fallback()
        {
            if (cache is null) return EmptyResult(signedIn: true, stale: true);
            var r = cache.Result!.Clone();
            r.FromCache = true;
            r.Stale = true;
            return r;
        }

        if (RetryUntil.TryGetValue(RetryKey, out var until) && until > now) return Fallback();

        ContributionsResponse response;
        try
        {
            response = await _api.GetContributionsAsync(token, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
#pragma warning disable CA1031 // Never throw for network problems (SPEC §7.2).
        catch (Exception)
#pragma warning restore CA1031
        {
            return Fallback();
        }

        if (response.Status == HttpStatusCode.Unauthorized)
        {
            SafeUpdate(f =>
            {
                if (f.SessionToken == token)
                {
                    f.SessionToken = null;
                    f.Cache = null;
                }
            });
            return EmptyResult();
        }
        if ((int)response.Status == 429)
        {
            var wait = response.RetryAfter is { } ra && ra > TimeSpan.Zero ? ra : TimeSpan.FromSeconds(60);
            RetryUntil[RetryKey] = Now() + wait;
            return Fallback();
        }
        if (!response.IsSuccess) return Fallback();

        var result = response.Result!;
        result.FromCache = false;
        var unavailable = result.Unavailable ?? Array.Empty<string>();
        if (unavailable.Count > 0)
        {
            result.Stale = true;
            if (cache is not null)
            {
                var have = new HashSet<string>(result.Contributions.Select(c => c.Id), StringComparer.Ordinal);
                var merged = result.Contributions.ToList();
                merged.AddRange(cache.Result!.Contributions.Where(c => unavailable.Contains(c.Provider) && !have.Contains(c.Id)));
                result.Contributions = merged;
            }
        }

        var storedAt = Now();
        SafeUpdate(f =>
        {
            // PROTOCOL §7.0 refresh races: a concurrent sign-out or sign-in replaced the token; keep its state.
            if (f.SessionToken != token) return;
            if (response.RenewedSessionToken is not null) f.SessionToken = response.RenewedSessionToken;
            f.Cache = new StorageCache { Result = result, StoredAt = storedAt };
        });
        return result;
    }

    private string RetryKey => _api.BaseUrl + "|" + _targets.Param;

    /// <summary>Writes state, ignoring storage failures: Sponsorkit must never break the host app.</summary>
    private void SafeUpdate(Action<StorageFile> update)
    {
        try
        {
            _store!.Update(update);
        }
#pragma warning disable CA1031 // Custom ISponsorkitStorage backends may throw anything.
        catch (Exception)
#pragma warning restore CA1031
        {
        }
    }

    /// <summary>
    /// Writes state that the caller asked for (sign-in, sign-out). A storage failure surfaces as
    /// <c>invalid_config</c>, so every exception the SDK throws stays a <see cref="SponsorkitError"/> (PROTOCOL §7).
    /// </summary>
    private void RequiredUpdate(Action<StorageFile> update, string what)
    {
        try
        {
            _store!.Update(update);
        }
#pragma warning disable CA1031 // Wrapped into a SponsorkitError with the original as the inner exception.
        catch (Exception e)
#pragma warning restore CA1031
        {
            var where = _storage is FileStorage fs ? $" in {fs.Directory} (check StorageDirectory)" : " (check the configured Storage)";
            throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, $"Could not {what}{where}: {e.Message}", e);
        }
    }

    // ------------------------------------------------------------------ dev-time check

    private Task DevCheckAsync(CancellationToken cancellationToken)
    {
        if (!_devChecks || IsDisabled || _mock is not null) return Task.CompletedTask;
        var lazy = DevCheckMemo.GetOrAdd(_api.BaseUrl + "|" + _targets.Param, _ => new Lazy<Task>(RunDevCheckAsync));
        var task = lazy.Value;
        if (task.IsCompleted || !cancellationToken.CanBeCanceled) return task;
        return WaitAsync(task, cancellationToken);
    }

    private static async Task WaitAsync(Task task, CancellationToken cancellationToken)
    {
        var cancelled = Task.Delay(Timeout.Infinite, cancellationToken);
        if (await Task.WhenAny(task, cancelled).ConfigureAwait(false) != task) cancellationToken.ThrowIfCancellationRequested();
        await task.ConfigureAwait(false);
    }

    private async Task RunDevCheckAsync()
    {
        var lookup = await _api.LookupTargetsAsync(_targets, CancellationToken.None).ConfigureAwait(false);
        if (lookup?.Targets is null) return; // Offline or failing: the check is advisory.
        var missing = lookup.Targets.Where(t => !t.Exists).Select(t => t.Target).ToList();
        if (missing.Count > 0)
        {
            throw new SponsorkitError(
                SponsorkitErrorCodes.InvalidConfig,
                $"Sponsorkit target(s) not found or without a sponsor listing: {string.Join(", ", missing)}. (This dev-time check runs only when DevChecks or SPONSORKIT_DEV_CHECKS is set.)");
        }
    }

    // ------------------------------------------------------------------ sign-in

    /// <summary>
    /// Signs the supporter in (loopback or paste-back, PROTOCOL §7). While already signed in, this adds another
    /// identity (for example <c>new SignInOptions { Provider = "opencollective" }</c>) to the session.
    /// </summary>
    /// <param name="options">Provider and sign-in method overrides.</param>
    /// <param name="cancellationToken">Cancels the sign-in; it then throws <c>cancelled</c>.</param>
    /// <returns>The contribution result returned with the new session.</returns>
    /// <exception cref="SponsorkitError">
    /// <c>disabled</c>; <c>invalid_config</c> (including when the new session could not be written to storage); <c>access_denied</c>, <c>invalid_state</c> or <c>provider_error</c> from the provider;
    /// <c>invalid_code</c> (the API rejected the code); <c>cancelled</c> (the <paramref name="cancellationToken"/> fired or no
    /// paste-back code was entered); <c>timeout</c> (not finished within <see cref="SponsorkitOptions.SignInTimeout"/>);
    /// <c>network_error</c> (the API was unreachable or answered 5xx, 429 or an unexpected response).
    /// </exception>
    public async Task<ContributionResult> SignInAsync(SignInOptions? options = null, CancellationToken cancellationToken = default)
    {
        if (IsDisabled) throw new SponsorkitError(SponsorkitErrorCodes.Disabled, "Sponsorkit is disabled (SPONSORKIT_DISABLE).");
        ValidateProvider(options?.Provider);
        if (_mock is not null)
        {
            lock (_mockLock)
            {
                if (!_mockSignedIn)
                {
                    _mockSignedIn = true;
                    _mockContributions = new List<Contribution>();
                }
            }
            return MockNow();
        }
        try
        {
            await DevCheckAsync(cancellationToken).ConfigureAwait(false);

            var existing = _store!.Load().SessionToken;
            var verifier = Pkce.CreateVerifier();
            var query = new List<KeyValuePair<string, string?>>
            {
                new("targets", _targets.Param),
                new("challenge", Pkce.Challenge(verifier)),
                new("app_name", _appName),
                new("provider", options?.Provider),
                new("add", existing is null ? null : "1"),
            };
            var code = await ObtainCodeAsync("/connect", query, options?.Method ?? _options.SignInMethod, null, cancellationToken).ConfigureAwait(false);
            return await ExchangeAsync(code, verifier, existing, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException e) when (cancellationToken.IsCancellationRequested)
        {
            throw new SponsorkitError(SponsorkitErrorCodes.Cancelled, "Sign-in was cancelled.", e);
        }
    }

    private void ValidateProvider(string? provider)
    {
        if (provider is not null && !_targets.HasProvider(provider))
            throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, $"Provider \"{provider}\" is not one of the configured targets ({_targets.Param}).");
    }

    /// <summary>
    /// Waits for the supporter to finish signing in and returns the code. Bounded by <see cref="SponsorkitOptions.SignInTimeout"/>
    /// (throws <c>timeout</c>); cancellation through <paramref name="cancellationToken"/> surfaces as <see cref="OperationCanceledException"/>.
    /// </summary>
    private async Task<string> ObtainCodeAsync(
        string page,
        List<KeyValuePair<string, string?>> query,
        SignInMethod method,
        string? redirectAfterCode,
        CancellationToken cancellationToken)
    {
        using var limit = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        limit.CancelAfter(_signInTimeout);
        try
        {
            if (method == SignInMethod.Paste) return await PasteAsync(page, query, limit.Token).ConfigureAwait(false);
            if (method == SignInMethod.Auto && _options.OpenBrowser is null && !Platform.CanOpenLocalBrowser())
                return await PasteAsync(page, query, limit.Token).ConfigureAwait(false);
            try
            {
                return await LoopbackAsync(page, query, redirectAfterCode, method == SignInMethod.Auto, limit.Token).ConfigureAwait(false);
            }
            catch (BrowserLaunchException)
            {
                return await PasteAsync(page, query, limit.Token).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException e) when (limit.IsCancellationRequested && !cancellationToken.IsCancellationRequested)
        {
            throw new SponsorkitError(SponsorkitErrorCodes.Timeout, $"Sign-in did not complete within {_signInTimeout.TotalSeconds:0.###} seconds.", e);
        }
    }

    private string PageUrl(string page, IEnumerable<KeyValuePair<string, string?>> query) => _api.BaseUrl + page + "?" + QueryString.Build(query);

    private async Task<string> LoopbackAsync(
        string page,
        List<KeyValuePair<string, string?>> query,
        string? redirectAfterCode,
        bool fallBackToPaste,
        CancellationToken cancellationToken)
    {
        LoopbackServer server;
        try
        {
            server = new LoopbackServer(redirectAfterCode);
        }
        catch (Exception e) when (e is SocketException or IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            // PROTOCOL §7.0: Auto falls back to paste-back when 127.0.0.1 cannot be bound.
            if (fallBackToPaste) throw new BrowserLaunchException(e);
            throw new SponsorkitError(SponsorkitErrorCodes.NetworkError, "Could not listen on 127.0.0.1 for the sign-in callback: " + e.Message, e);
        }
        using var listening = server;
        var full = new List<KeyValuePair<string, string?>>(query)
        {
            new("delivery", "loopback"),
            new("redirect_uri", server.RedirectUri),
        };
        var url = PageUrl(page, full);

        // PROTOCOL §7.0: the callback is accepted while the browser opener is still running.
        var open = OpenBrowserAsync(url, cancellationToken);
        var waiter = Task.Delay(Timeout.Infinite, cancellationToken);
        var done = await Task.WhenAny(server.Result, open, waiter).ConfigureAwait(false);
        if (done == open && !server.Result.IsCompleted)
        {
            try
            {
                await open.ConfigureAwait(false);
            }
            catch (BrowserLaunchException) when (!fallBackToPaste)
            {
                // Loopback was forced: let the supporter open the URL by hand and keep waiting for the callback.
                await Console.Error.WriteLineAsync("Could not open a browser. Open this URL to sign in:\n  " + url).ConfigureAwait(false);
            }
            catch (BrowserLaunchException) when (server.Result.IsCompleted)
            {
                // The callback arrived while the opener was failing: use it.
            }
            done = await Task.WhenAny(server.Result, waiter).ConfigureAwait(false);
        }
        if (!open.IsCompleted)
        {
            // Not cancelled: the opener (for example a test browser following the checkout 302) may still be busy.
            _ = open.ContinueWith(t => _ = t.Exception, CancellationToken.None, TaskContinuationOptions.OnlyOnFaulted, TaskScheduler.Default);
        }
        if (done != server.Result) cancellationToken.ThrowIfCancellationRequested();
        var callback = await server.Result.ConfigureAwait(false);
        if (callback.Code is { } code) return code;
        var error = callback.Error switch
        {
            SponsorkitErrorCodes.AccessDenied or SponsorkitErrorCodes.InvalidState or SponsorkitErrorCodes.ProviderError => callback.Error!,
            _ => SponsorkitErrorCodes.ProviderError,
        };
        throw new SponsorkitError(error, $"Sign-in failed: {callback.Error}");
    }

    private async Task OpenBrowserAsync(string url, CancellationToken cancellationToken)
    {
        try
        {
            if (_options.OpenBrowser is { } open)
            {
                await open(url, cancellationToken).ConfigureAwait(false);
            }
            else
            {
                await Console.Error.WriteLineAsync("Opening your browser to continue with Sponsorkit. If it does not open, visit:\n  " + url).ConfigureAwait(false);
                await Platform.OpenSystemBrowser(url, cancellationToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (SponsorkitError)
        {
            throw;
        }
#pragma warning disable CA1031 // Any launch failure triggers the paste-back fallback.
        catch (Exception e)
#pragma warning restore CA1031
        {
            throw new BrowserLaunchException(e);
        }
    }

    private async Task<string> PasteAsync(string page, List<KeyValuePair<string, string?>> query, CancellationToken cancellationToken)
    {
        var full = new List<KeyValuePair<string, string?>>(query) { new("delivery", "paste") };
        var url = PageUrl(page, full);
        await Console.Error.WriteLineAsync("To sign in, open this URL in a browser on any device:\n  " + url).ConfigureAwait(false);
        var prompt = _options.PromptForCode ?? Platform.ReadCodeFromStdin;
        var code = (await prompt(url, cancellationToken).ConfigureAwait(false))?.Trim();
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrEmpty(code)) throw new SponsorkitError(SponsorkitErrorCodes.Cancelled, "No sign-in code was entered.");
        return code!;
    }

    private async Task<ContributionResult> ExchangeAsync(string code, string verifier, string? existing, CancellationToken cancellationToken)
    {
        TokenResponse token;
        try
        {
            token = await _api.ExchangeAsync(code, verifier, existing, cancellationToken).ConfigureAwait(false);
        }
        catch (DeadSessionException)
        {
            // PROTOCOL §7: the stored session is dead. Clear it and retry the same code once as a fresh session.
            SafeUpdate(f =>
            {
                f.SessionToken = null;
                f.Cache = null;
            });
            token = await _api.ExchangeAsync(code, verifier, null, cancellationToken).ConfigureAwait(false);
        }
        var result = token.Result!;
        result.FromCache = false;
        var storedAt = Now();
        RequiredUpdate(
            f =>
            {
                f.SessionToken = token.SessionToken;
                f.Cache = new StorageCache { Result = result, StoredAt = storedAt };
            },
            "store the session");
        return result;
    }

    // ------------------------------------------------------------------ checkout

    /// <summary>
    /// Returns an anonymous, offline-safe link to the Sponsorkit checkout page (no sign-in, no PKCE challenge).
    /// Suits nags, READMEs and <c>--help</c> output.
    /// </summary>
    /// <param name="options">Preferred provider, amount (minor units), currency and frequency.</param>
    /// <returns>An absolute URL such as <c>https://sponsorkit.io/checkout?targets=github%3Aoctocat&amp;frequency=monthly</c>.</returns>
    /// <exception cref="SponsorkitError"><c>invalid_config</c>: an unconfigured provider, or an invalid frequency, amount or currency.</exception>
    public string CheckoutUrl(CheckoutUrlOptions? options = null) => PageUrl("/checkout", CheckoutQuery(options ?? new CheckoutUrlOptions()));

    private List<KeyValuePair<string, string?>> CheckoutQuery(CheckoutUrlOptions o)
    {
        // PROTOCOL §7.1 item 16: invalid options throw invalid_config, without network or disk access.
        if (o.Provider is not null && o.Provider is not ("github" or "opencollective"))
            throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, $"Unknown provider \"{o.Provider}\". Use github or opencollective.");
        ValidateProvider(o.Provider);
        if (o.Frequency is not null && o.Frequency is not (Frequencies.OneTime or Frequencies.Monthly or Frequencies.Yearly))
            throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, $"Invalid frequency \"{o.Frequency}\". Use one_time, monthly or yearly.");
        if (o.Amount is <= 0) throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, "amount must be a positive number of minor units");
        if (o.Currency is not null && !IsCurrencyCode(o.Currency))
            throw new SponsorkitError(SponsorkitErrorCodes.InvalidConfig, $"Invalid currency \"{o.Currency}\". Use a three-letter ISO 4217 code such as USD.");
        return new List<KeyValuePair<string, string?>>
        {
            new("targets", _targets.Param),
            new("provider", o.Provider),
            new("amount", o.Amount?.ToString(System.Globalization.CultureInfo.InvariantCulture)),
            new("currency", o.Currency?.ToUpperInvariant()),
            new("frequency", o.Frequency),
        };
    }

    private static bool IsCurrencyCode(string s) =>
        s.Length == 3 && s.All(c => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'));

    /// <summary>
    /// Sends the supporter to contribute and waits for the new contribution (SPEC §7.3). Signs in first when needed
    /// (in the same browser flow), opens the checkout page, then polls every
    /// <see cref="SponsorkitOptions.CheckoutPollInterval"/> until a new or changed contribution appears.
    /// </summary>
    /// <param name="options">Checkout preferences and the polling time limit (default 10 minutes).</param>
    /// <param name="cancellationToken">Stops signing in or waiting, in either phase; the result is then <see cref="CheckoutStatus.Unknown"/>.</param>
    /// <returns><see cref="CheckoutStatus.Contributed"/> with the contribution, or <see cref="CheckoutStatus.Unknown"/> when polling times out or on cancellation.</returns>
    /// <exception cref="SponsorkitError">
    /// <c>disabled</c>, <c>invalid_config</c>, or a sign-in error (including <c>timeout</c> when the sign-in phase exceeds
    /// <see cref="SponsorkitOptions.SignInTimeout"/>).
    /// </exception>
    public async Task<CheckoutResult> OpenCheckoutAsync(CheckoutOptions? options = null, CancellationToken cancellationToken = default)
    {
        if (IsDisabled) throw new SponsorkitError(SponsorkitErrorCodes.Disabled, "Sponsorkit is disabled (SPONSORKIT_DISABLE).");
        var o = options ?? new CheckoutOptions();
        var query = CheckoutQuery(o);
        if (_mock is not null)
        {
            var simulated = MockPresets.CheckoutContribution(_targets, o);
            lock (_mockLock)
            {
                if (!_mockSignedIn) _mockContributions = new List<Contribution>();
                _mockSignedIn = true;
                _mockContributions = _mockContributions.Where(c => c.Id != simulated.Id).Append(simulated).ToList();
            }
            return new CheckoutResult(CheckoutStatus.Contributed, simulated);
        }

        ContributionResult baseline;
        try
        {
            await DevCheckAsync(cancellationToken).ConfigureAwait(false);
            var file = _store!.Load();
            if (file.SessionToken is not null)
            {
                baseline = file.Cache?.Result ?? await GetCoreAsync(TimeSpan.Zero, cancellationToken).ConfigureAwait(false);
                var url = PageUrl("/checkout", query);
                try
                {
                    await OpenBrowserAsync(url, cancellationToken).ConfigureAwait(false);
                }
                catch (BrowserLaunchException)
                {
                    await Console.Error.WriteLineAsync("Open this URL to contribute:\n  " + url).ConfigureAwait(false);
                }
            }
            else
            {
                var verifier = Pkce.CreateVerifier();
                var signInQuery = new List<KeyValuePair<string, string?>>(query)
                {
                    new("challenge", Pkce.Challenge(verifier)),
                    new("app_name", _appName),
                };
                var continueUrl = PageUrl("/checkout", query) + "&step=choose";
                var code = await ObtainCodeAsync("/checkout", signInQuery, o.SignInMethod ?? _options.SignInMethod, continueUrl, cancellationToken).ConfigureAwait(false);
                baseline = await ExchangeAsync(code, verifier, null, cancellationToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return new CheckoutResult(CheckoutStatus.Unknown, null);
        }

        var before = baseline.Contributions.GroupBy(c => c.Id, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => SponsorkitJson.Serialize(g.Last()), StringComparer.Ordinal);
        var timeout = o.Timeout ?? DefaultCheckoutTimeout;
        var interval = o.PollInterval ?? _options.CheckoutPollInterval;
        if (interval <= TimeSpan.Zero) interval = TimeSpan.FromSeconds(1);
        var clock = Stopwatch.StartNew();
        while (!cancellationToken.IsCancellationRequested && clock.Elapsed < timeout)
        {
            ContributionResult current;
            try
            {
                current = await GetCoreAsync(TimeSpan.Zero, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            if (!current.SignedIn) break;
            var changed = current.Contributions.FirstOrDefault(c =>
                !before.TryGetValue(c.Id, out var json) || json != SponsorkitJson.Serialize(c));
            if (changed is not null) return new CheckoutResult(CheckoutStatus.Contributed, changed);

            var remaining = timeout - clock.Elapsed;
            if (remaining <= TimeSpan.Zero) break;
            try
            {
                await Task.Delay(remaining < interval ? remaining : interval, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
        return new CheckoutResult(CheckoutStatus.Unknown, null);
    }

    // ------------------------------------------------------------------ sign-out

    /// <summary>
    /// Signs out locally: deletes the stored session token and cache, keeping nag state. There is no server-side
    /// sign-out; the supporter can revoke Sponsorkit's access at the provider.
    /// </summary>
    /// <param name="cancellationToken">Checked once on entry: an already-cancelled token throws <see cref="OperationCanceledException"/>. The call is otherwise synchronous.</param>
    /// <returns>A task that has already completed when the method returns.</returns>
    /// <exception cref="SponsorkitError"><c>invalid_config</c>: the storage could not be written.</exception>
    /// <exception cref="OperationCanceledException">The <paramref name="cancellationToken"/> was already cancelled when the method was called.</exception>
    public Task SignOutAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (IsDisabled) return Task.CompletedTask;
        if (_mock is not null)
        {
            lock (_mockLock)
            {
                _mockSignedIn = false;
                _mockContributions = new List<Contribution>();
            }
            return Task.CompletedTask;
        }
        string? existing;
        try
        {
            existing = _storage!.Read(_targets.Hash);
        }
#pragma warning disable CA1031 // Unreadable: still try to overwrite it with a signed-out document.
        catch (Exception)
#pragma warning restore CA1031
        {
            existing = "{}";
        }
        if (existing is null) return Task.CompletedTask;
        // StateStore.Load never throws: a corrupt document is replaced by a clean signed-out one.
        RequiredUpdate(
            f =>
            {
                f.SessionToken = null;
                f.Cache = null;
            },
            "clear the stored session");
        return Task.CompletedTask;
    }

    // ------------------------------------------------------------------ nag

    /// <summary>Creates a nag helper (SPEC §7.5). See <see cref="SponsorkitNag"/>.</summary>
    /// <param name="options">The nag id and how often it may be shown.</param>
    /// <returns>The helper.</returns>
    public SponsorkitNag Nag(NagOptions options) => new(this, options ?? throw new ArgumentNullException(nameof(options)));

    internal bool NagSuppressedByEnvironment() =>
        _env.IsSet("SPONSORKIT_NO_NAG") || _env.IsSet("CI") || !(_interactive ?? Platform.IsInteractiveTerminal());

    internal void CountNagRun(string id)
    {
        if (IsDisabled) return;
        if (_mock is not null)
        {
            // PROTOCOL §7.1 item 14: in mock mode nag state lives in memory, per instance.
            lock (_mockLock)
            {
                if (!_mockNagRunsCounted.Add(id)) return;
            }
        }
        else if (!NagRunsCounted.TryAdd(_api.BaseUrl + "|" + _targets.Hash + ":" + id, 0))
        {
            return;
        }
        SafeUpdate(f =>
        {
            f.Nags ??= new Dictionary<string, NagState>(StringComparer.Ordinal);
            if (!f.Nags.TryGetValue(id, out var state)) f.Nags[id] = state = new NagState();
            state.Runs++;
        });
    }

    internal NagState ReadNag(string id)
    {
        var nags = _store?.Load().Nags;
        return nags is not null && nags.TryGetValue(id, out var state) ? state : new NagState();
    }

    internal void MarkNagShown(string id)
    {
        if (IsDisabled) return;
        var now = Now();
        SafeUpdate(f =>
        {
            f.Nags ??= new Dictionary<string, NagState>(StringComparer.Ordinal);
            f.Nags[id] = new NagState { Runs = 0, LastShown = now };
        });
    }

    internal DateTimeOffset CurrentTime() => Now();

    private sealed class BrowserLaunchException : Exception
    {
        public BrowserLaunchException(Exception inner)
            : base("Could not open the browser.", inner)
        {
        }
    }
}
