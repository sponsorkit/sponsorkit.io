using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Internal;

namespace Sponsorkit.Tests;

/// <summary>Client behaviour that the conformance scenarios do not pin down.</summary>
public sealed class ClientTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "sponsorkit-dotnet-unit-" + Guid.NewGuid().ToString("N")[..8]);

    public void Dispose()
    {
        if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true);
    }

    private static string UnreachableBaseUrl()
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var port = ((IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        return $"http://127.0.0.1:{port}";
    }

    [Fact]
    public async Task Auto_sign_in_falls_back_to_paste_when_the_browser_cannot_open()
    {
        string? prompted = null;
        var sk = new SponsorkitClient(new SponsorkitOptions
        {
            GitHub = "octocat",
            AppName = "unit-test",
            ApiBaseUrl = UnreachableBaseUrl(),
            StorageDirectory = _dir,
            Environment = new Dictionary<string, string>(),
            DevChecks = false,
            OpenBrowser = (_, _) => throw new InvalidOperationException("no browser"),
            PromptForCode = (url, _) =>
            {
                prompted = url;
                return Task.FromResult("skc_example");
            },
        });
        var e = await Assert.ThrowsAsync<SponsorkitError>(() => sk.SignInAsync());
        Assert.Equal(SponsorkitErrorCodes.NetworkError, e.Code);
        Assert.NotNull(prompted);
        Assert.Contains("/connect/?targets=github%3Aoctocat&challenge=", prompted, StringComparison.Ordinal);
        Assert.Contains("delivery=paste", prompted, StringComparison.Ordinal);
        Assert.Contains("app_name=unit-test", prompted, StringComparison.Ordinal);
        Assert.False(sk.IsSignedIn());
    }

    [Fact]
    public async Task Sign_in_can_be_cancelled_while_waiting_for_the_callback()
    {
        var sk = new SponsorkitClient(new SponsorkitOptions
        {
            GitHub = "octocat",
            ApiBaseUrl = UnreachableBaseUrl(),
            StorageDirectory = _dir,
            SignInMethod = SignInMethod.Loopback,
            OpenBrowser = (_, _) => Task.CompletedTask,
        });
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(300));
        var e = await Assert.ThrowsAsync<SponsorkitError>(() => sk.SignInAsync(null, cts.Token));
        Assert.Equal(SponsorkitErrorCodes.Cancelled, e.Code);
    }

    [Fact]
    public async Task Paste_sign_in_times_out_and_an_empty_code_cancels()
    {
        SponsorkitClient Make(Func<string, CancellationToken, Task<string>> prompt) => new(new SponsorkitOptions
        {
            GitHub = "octocat",
            ApiBaseUrl = UnreachableBaseUrl(),
            StorageDirectory = _dir,
            Environment = new Dictionary<string, string>(),
            SignInMethod = SignInMethod.Paste,
            SignInTimeout = TimeSpan.FromMilliseconds(200),
            PromptForCode = prompt,
        });
        var timedOut = await Assert.ThrowsAsync<SponsorkitError>(() => Make(async (_, ct) =>
        {
            await Task.Delay(Timeout.Infinite, ct);
            return "never";
        }).SignInAsync());
        Assert.Equal(SponsorkitErrorCodes.Timeout, timedOut.Code);
        var empty = await Assert.ThrowsAsync<SponsorkitError>(() => Make((_, _) => Task.FromResult("  ")).SignInAsync());
        Assert.Equal(SponsorkitErrorCodes.Cancelled, empty.Code);
        Assert.False(Directory.Exists(_dir));
    }

    [Fact]
    public void Sign_in_timeout_must_be_positive()
    {
        var e = Assert.Throws<SponsorkitError>(() => new SponsorkitClient(new SponsorkitOptions { GitHub = "x", SignInTimeout = TimeSpan.Zero }));
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, e.Code);
        Assert.False(new SponsorkitClient(new SponsorkitOptions { GitHub = "x", SignInTimeout = Timeout.InfiniteTimeSpan }).IsDisabled);
    }

    [Fact]
    public void Checkout_url_accepts_valid_options_and_normalizes_the_currency()
    {
        var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", Environment = new Dictionary<string, string>() });
        var url = sk.CheckoutUrl(new CheckoutUrlOptions { Provider = "github", Amount = 500, Currency = "usd", Frequency = Frequencies.Monthly });
        Assert.Equal("https://sponsorkit.github.io/sponsorkit.io/checkout/?targets=github%3Aoctocat&provider=github&amount=500&currency=USD&frequency=monthly", url);
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, Assert.Throws<SponsorkitError>(() => sk.CheckoutUrl(new CheckoutUrlOptions { Currency = "" })).Code);
    }

    [Fact]
    public async Task Dev_check_is_skipped_when_offline()
    {
        var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", ApiBaseUrl = UnreachableBaseUrl(), StorageDirectory = _dir, DevChecks = true });
        var fc = await sk.GetFinancialContributionAsync();
        Assert.False(fc.SignedIn);
        Assert.False(Directory.Exists(_dir));
    }

    [Fact]
    public void Configuration_is_validated()
    {
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, Assert.Throws<SponsorkitError>(() => new SponsorkitClient(new SponsorkitOptions { GitHub = "x", ApiBaseUrl = "ftp://example.com" })).Code);
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, Assert.Throws<SponsorkitError>(() => new SponsorkitClient(new SponsorkitOptions { GitHub = "x", AppName = new string('a', 65) })).Code);
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, Assert.Throws<SponsorkitError>(() => new SponsorkitClient(new SponsorkitOptions { GitHub = "x", SiteBaseUrl = "not a url" })).Code);
        Assert.Equal("https://api.example.com", new SponsorkitClient(new SponsorkitOptions { GitHub = "x", ApiBaseUrl = "https://api.example.com/" }).ApiBaseUrl);
        Assert.Throws<ArgumentNullException>(() => new SponsorkitClient(null!));
    }

    [Theory]
    [InlineData(null, null, "https://api.sponsorkit.io", "https://sponsorkit.github.io/sponsorkit.io")]
    [InlineData("", "", "https://api.sponsorkit.io", "https://sponsorkit.github.io/sponsorkit.io")]
    [InlineData("https://sk.example.com//", null, "https://sk.example.com", "https://sk.example.com")]
    [InlineData("https://sk.example.com", "", "https://sk.example.com", "https://sk.example.com")]
    [InlineData(null, "https://example.github.io/sk/", "https://api.sponsorkit.io", "https://example.github.io/sk")]
    [InlineData("https://api.example.com/", "https://example.github.io/sk//", "https://api.example.com", "https://example.github.io/sk")]
    public void Base_urls_follow_the_defaulting_rule(string? api, string? site, string wantApi, string wantSite)
    {
        var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", ApiBaseUrl = api, SiteBaseUrl = site, Environment = new Dictionary<string, string>() });
        Assert.Equal(wantApi, sk.ApiBaseUrl);
        Assert.Equal(wantSite, sk.SiteBaseUrl);
        Assert.Equal(wantSite + "/checkout/?targets=github%3Aoctocat", sk.CheckoutUrl());
    }

    [Fact]
    public async Task Nag_uses_the_injected_clock_for_or_every()
    {
        var now = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        SponsorkitClient Make() => new(new SponsorkitOptions { GitHub = "octocat", StorageDirectory = _dir, Clock = () => now, Environment = new Dictionary<string, string>(), Interactive = false });
        SponsorkitClient.ResetProcessState();
        var nag = Make().Nag(new NagOptions("clock") { Every = 100, OrEvery = TimeSpan.FromDays(7) });
        Assert.False(await nag.DueAsync(_ => true, force: true));
        nag.Shown();
        now = now.AddDays(6);
        Assert.False(await nag.DueAsync(_ => true, force: true));
        now = now.AddDays(1);
        Assert.True(await nag.DueAsync(_ => true, force: true));
        Assert.False(await nag.DueAsync(_ => true), "Interactive = false");
        SponsorkitClient.ResetProcessState();
    }

    [Fact]
    public async Task Verify_session_rejects_malformed_tokens_without_a_request()
    {
        var e = await Assert.ThrowsAsync<SponsorkitError>(() => SponsorkitServer.VerifySessionAsync("not-a-token", new VerifySessionOptions { GitHub = "octocat", ApiBaseUrl = UnreachableBaseUrl() }));
        Assert.Equal(SponsorkitErrorCodes.SessionInvalid, e.Code);
        var offline = await Assert.ThrowsAsync<SponsorkitError>(() => SponsorkitServer.VerifySessionAsync("sks_abc", new VerifySessionOptions { GitHub = "octocat", ApiBaseUrl = UnreachableBaseUrl() }));
        Assert.Equal(SponsorkitErrorCodes.NetworkError, offline.Code);
    }

    [Fact]
    public async Task Loopback_server_answers_callbacks_and_ignores_other_paths()
    {
        using var server = new LoopbackServer("http://example.invalid/checkout?step=choose");
        using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false });
        using (var other = await http.GetAsync($"http://127.0.0.1:{server.Port}/favicon.ico")) Assert.Equal(HttpStatusCode.NotFound, other.StatusCode);
        Assert.False(server.Result.IsCompleted);
        using (var cb = await http.GetAsync(server.RedirectUri + "?code=skc_abc%2B1"))
        {
            Assert.Equal(HttpStatusCode.Found, cb.StatusCode);
            Assert.Equal("http://example.invalid/checkout?step=choose", cb.Headers.Location!.OriginalString);
        }
        var result = await server.Result;
        Assert.Equal("skc_abc+1", result.Code);
        Assert.Null(result.Error);
    }

    [Fact]
    public void Storage_writes_are_atomic_and_private()
    {
        var storage = new FileStorage(_dir);
        storage.Write("k", "{\"v\":1}");
        storage.Write("k", "{\"v\":1,\"nags\":{}}");
        Assert.Equal("{\"v\":1,\"nags\":{}}", storage.Read("k"));
        Assert.Single(Directory.GetFiles(_dir));
        if (!OperatingSystem.IsWindows())
        {
            Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite, File.GetUnixFileMode(storage.PathFor("k")));
            Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute, File.GetUnixFileMode(_dir));
        }
        Assert.Null(storage.Read("missing"));
    }

    [Fact]
    public async Task Corrupt_storage_is_treated_as_signed_out()
    {
        var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", StorageDirectory = _dir, ApiBaseUrl = UnreachableBaseUrl() });
        Directory.CreateDirectory(_dir);
        await File.WriteAllTextAsync(Path.Combine(_dir, sk.TargetsHash + ".json"), "{not json");
        Assert.False(sk.IsSignedIn());
        Assert.False((await sk.GetFinancialContributionAsync()).SignedIn);
        await sk.SignOutAsync();
    }
}
