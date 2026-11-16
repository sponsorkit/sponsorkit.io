using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Internal;

namespace Sponsorkit.Tests;

/// <summary>Regression tests for PROTOCOL §7.0 (robustness rules for all SDKs).</summary>
public sealed class RobustnessRulesTests : IDisposable
{
    private const string Ok = "{\"signedIn\":true,\"targets\":[\"github:octocat\"],\"contributions\":[]}";
    private const string TokenBody = "{\"sessionToken\":\"sks_new\",\"result\":" + Ok + "}";

    private readonly string _dir = Path.Combine(Path.GetTempPath(), "sponsorkit-dotnet-rules-" + Guid.NewGuid().ToString("N")[..8]);

    public void Dispose()
    {
        if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true);
    }

    private sealed class Storage : ISponsorkitStorage
    {
        private readonly ConcurrentDictionary<string, string> _data = new();

        public string? Initial { get; set; }

        public string? Read(string key) => _data.TryGetValue(key, out var v) ? v : Initial;

        public void Write(string key, string json) => _data[key] = json;
    }

    private sealed class Handler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _send;

        public Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send)
        {
            _send = send;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            _send(request, cancellationToken);
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static Handler Hanging() => new(async (_, ct) =>
    {
        await Task.Delay(Timeout.Infinite, ct);
        throw new InvalidOperationException("unreachable");
    });

    private static SponsorkitOptions Options(ISponsorkitStorage storage, HttpMessageHandler handler) => new()
    {
        GitHub = "octocat",
        Storage = storage,
        ApiBaseUrl = "http://sponsorkit.test",
        HttpClient = new HttpClient(handler),
        Environment = new Dictionary<string, string>(),
        DevChecks = false,
        Interactive = true,
        SignInMethod = SignInMethod.Paste,
        PromptForCode = (_, _) => Task.FromResult("skc_code"),
    };

    private static string Doc(string token, string? cacheResult = null, string storedAt = "2000-01-01T00:00:00Z") =>
        "{\"v\":1,\"sessionToken\":\"" + token + "\"" + (cacheResult is null ? "" : ",\"cache\":{\"result\":" + cacheResult + ",\"storedAt\":\"" + storedAt + "\"}") + "}";

    // ------------------------------------------------------------------ HTTP

    [Fact]
    public async Task Request_timeout_defaults_to_30_seconds_and_counts_as_a_network_error()
    {
        Assert.Equal(TimeSpan.FromSeconds(30), new SponsorkitOptions().RequestTimeout);
        Assert.Equal(TimeSpan.FromSeconds(30), new VerifySessionOptions().RequestTimeout);

        var storage = new Storage { Initial = Doc("sks_x", Ok) };
        var o = Options(storage, Hanging());
        o.RequestTimeout = TimeSpan.FromMilliseconds(200);
        var sk = new SponsorkitClient(o);
        var clock = Stopwatch.StartNew();
        var fc = await sk.GetFinancialContributionAsync(TimeSpan.Zero);
        Assert.True(fc.FromCache);
        Assert.True(fc.Stale);
        Assert.True(clock.Elapsed < TimeSpan.FromSeconds(10));

        var signIn = await Assert.ThrowsAsync<SponsorkitError>(() => sk.SignInAsync());
        Assert.Equal(SponsorkitErrorCodes.NetworkError, signIn.Code);

        var verify = await Assert.ThrowsAsync<SponsorkitError>(() => SponsorkitServer.VerifySessionAsync("sks_x", new VerifySessionOptions
        {
            GitHub = "octocat",
            ApiBaseUrl = "http://sponsorkit.test",
            HttpClient = new HttpClient(Hanging()),
            RequestTimeout = TimeSpan.FromMilliseconds(200),
        }));
        Assert.Equal(SponsorkitErrorCodes.NetworkError, verify.Code);
    }

    [Fact]
    public async Task Request_timeout_zero_disables_it_and_negative_is_invalid_config()
    {
        var slow = new Handler(async (_, ct) =>
        {
            await Task.Delay(300, ct);
            return Json(HttpStatusCode.OK, Ok);
        });
        var r = await SponsorkitServer.VerifySessionAsync("sks_x", new VerifySessionOptions
        {
            GitHub = "octocat",
            ApiBaseUrl = "http://sponsorkit.test",
            HttpClient = new HttpClient(slow),
            RequestTimeout = TimeSpan.Zero,
        });
        Assert.True(r.SignedIn);

        var o = Options(new Storage(), slow);
        o.RequestTimeout = TimeSpan.FromSeconds(-1);
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, Assert.Throws<SponsorkitError>(() => new SponsorkitClient(o)).Code);
        var e = await Assert.ThrowsAsync<SponsorkitError>(() => SponsorkitServer.VerifySessionAsync("sks_x", new VerifySessionOptions
        {
            GitHub = "octocat",
            RequestTimeout = TimeSpan.FromSeconds(-1),
        }));
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, e.Code);
    }

    [Theory]
    [InlineData("{\"code\":\"invalid_request\",\"detail\":\"x\"}")]
    [InlineData("{\"code\":\"session_invalid\"}")]
    [InlineData("not json")]
    [InlineData("")]
    public async Task An_unexpected_400_from_the_token_endpoint_is_a_network_error(string body)
    {
        var sk = new SponsorkitClient(Options(new Storage(), new Handler((_, _) => Task.FromResult(Json(HttpStatusCode.BadRequest, body)))));
        var e = await Assert.ThrowsAsync<SponsorkitError>(() => sk.SignInAsync());
        Assert.Equal(SponsorkitErrorCodes.NetworkError, e.Code);
    }

    [Theory]
    [InlineData("2147483647", 86400.0)]
    [InlineData("90000", 86400.0)]
    [InlineData("120", 120.0)]
    [InlineData("inf", null)]
    [InlineData("1e999", null)]
    [InlineData("NaN", null)]
    [InlineData("99999999999999999999", null)]
    [InlineData("-5", null)]
    [InlineData("Fri, 31 Dec 9999 23:59:59 GMT", 86400.0)]
    public async Task Retry_after_is_clamped_to_a_day_and_non_finite_values_are_ignored(string header, double? expectedSeconds)
    {
        Handler Make() => new((_, _) =>
        {
            var res = Json((HttpStatusCode)429, "{\"code\":\"rate_limited\"}");
            res.Headers.TryAddWithoutValidation("Retry-After", header);
            return Task.FromResult(res);
        });
        var e = await Assert.ThrowsAsync<SponsorkitError>(() => SponsorkitServer.VerifySessionAsync("sks_x", new VerifySessionOptions
        {
            GitHub = "octocat",
            ApiBaseUrl = "http://sponsorkit.test",
            HttpClient = new HttpClient(Make()),
        }));
        Assert.Equal(SponsorkitErrorCodes.NetworkError, e.Code);
        Assert.Equal(expectedSeconds, e.RetryAfter?.TotalSeconds);

        // The client's backoff must not overflow or crash either.
        SponsorkitClient.ResetProcessState();
        var o = Options(new Storage { Initial = Doc("sks_x", Ok) }, Make());
        o.Clock = () => DateTimeOffset.MaxValue.AddDays(-2);
        var fc = await new SponsorkitClient(o).GetFinancialContributionAsync(TimeSpan.Zero);
        Assert.True(fc.Stale);
        SponsorkitClient.ResetProcessState();
    }

    // ------------------------------------------------------------------ loopback

    private static async Task<string> Get(int port, string target)
    {
        using var client = new TcpClient();
        await client.ConnectAsync(IPAddress.Loopback, port);
        var stream = client.GetStream();
        await stream.WriteAsync(Encoding.ASCII.GetBytes($"GET {target} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"));
        using var reader = new StreamReader(stream, Encoding.ASCII);
        return await reader.ReadToEndAsync();
    }

    [Theory]
    [InlineData("/callback")]
    [InlineData("/callback?code=")]
    [InlineData("/callback?error=")]
    [InlineData("/callback?code=&error=&state=x")]
    public async Task A_bare_callback_gets_400_and_the_receiver_keeps_waiting(string target)
    {
        using var server = new LoopbackServer();
        Assert.StartsWith("HTTP/1.1 400", await Get(server.Port, target), StringComparison.Ordinal);
        Assert.False(server.Result.IsCompleted);
        Assert.StartsWith("HTTP/1.1 200", await Get(server.Port, "/callback?code=skc_ok"), StringComparison.Ordinal);
        Assert.Equal("skc_ok", (await server.Result.WaitAsync(TimeSpan.FromSeconds(5))).Code);
    }

    [Fact]
    public async Task A_loopback_bind_failure_falls_back_to_paste_in_auto()
    {
        // 192.0.2.1 (TEST-NET-1) is not a local address, so binding to it fails like a blocked 127.0.0.1.
        LoopbackServer.TestBindAddress.Value = IPAddress.Parse("192.0.2.1");
        try
        {
            string? prompted = null;
            var o = Options(new Storage(), new Handler((_, _) => Task.FromResult(Json(HttpStatusCode.OK, TokenBody))));
            o.SignInMethod = SignInMethod.Auto;
            o.OpenBrowser = (_, _) => throw new InvalidOperationException("must not open a browser without a receiver");
            o.PromptForCode = (url, _) =>
            {
                prompted = url;
                return Task.FromResult("skc_code");
            };
            var sk = new SponsorkitClient(o);
            await sk.SignInAsync();
            Assert.Contains("delivery=paste", prompted, StringComparison.Ordinal);
            Assert.True(sk.IsSignedIn());

            o.SignInMethod = SignInMethod.Loopback;
            var forced = await Assert.ThrowsAsync<SponsorkitError>(() => new SponsorkitClient(o).SignInAsync());
            Assert.Equal(SponsorkitErrorCodes.NetworkError, forced.Code);
        }
        finally
        {
            LoopbackServer.TestBindAddress.Value = null;
        }
    }

    [Fact]
    public async Task The_callback_is_accepted_while_open_browser_is_still_running()
    {
        var o = Options(new Storage(), new Handler((_, _) => Task.FromResult(Json(HttpStatusCode.OK, TokenBody))));
        o.SignInMethod = SignInMethod.Auto;
        o.SignInTimeout = TimeSpan.FromSeconds(20);
        var opener = new TaskCompletionSource<bool>();
        o.OpenBrowser = async (url, ct) =>
        {
            var redirect = Uri.UnescapeDataString(url.Substring(url.IndexOf("redirect_uri=", StringComparison.Ordinal) + "redirect_uri=".Length).Split('&')[0]);
            var port = new Uri(redirect).Port;
            _ = Task.Run(() => Get(port, "/callback?code=skc_code"));
            try
            {
                await Task.Delay(Timeout.Infinite, ct); // An opener that never returns.
            }
            finally
            {
                opener.TrySetResult(true);
            }
        };
        var sk = new SponsorkitClient(o);
        var result = await sk.SignInAsync().WaitAsync(TimeSpan.FromSeconds(15));
        Assert.True(result.SignedIn);
        Assert.True(sk.IsSignedIn());
        // The still-running opener is told to stop.
        Assert.True(await opener.Task.WaitAsync(TimeSpan.FromSeconds(5)));
    }

    [Fact]
    public async Task A_system_opener_still_running_after_about_1_5_seconds_counts_as_opened()
    {
        if (OperatingSystem.IsWindows()) return;
        Directory.CreateDirectory(_dir);
        var path = Path.Combine(_dir, "slow-open");
        File.WriteAllText(path, "#!/bin/sh\nsleep 30\nexit 1\n");
        File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        var clock = Stopwatch.StartNew();
        await Platform.OpenSystemBrowser("https://example.com/", CancellationToken.None, path);
        Assert.InRange(clock.Elapsed.TotalSeconds, 1.3, 5.0);
    }

    // ------------------------------------------------------------------ storage

    [Theory]
    [InlineData("sks_a b")]
    [InlineData("sks_\\u00e9")]
    [InlineData("sks_\\u0007")]
    [InlineData("sks_")]
    [InlineData("SKS_abc")]
    public void A_token_that_is_not_sks_plus_printable_ascii_reads_as_absent(string token)
    {
        var sk = new SponsorkitClient(Options(new Storage { Initial = Doc(token) }, Hanging()));
        Assert.False(sk.IsSignedIn());
    }

    [Theory]
    [InlineData("{\"v\":1,\"sessionToken\":\"sks_x\",\"cache\":5}")]
    [InlineData("{\"v\":1,\"sessionToken\":\"sks_x\",\"cache\":{\"result\":{\"signedIn\":true,\"targets\":[\"github:octocat\"],\"contributions\":[5]},\"storedAt\":\"2999-01-01T00:00:00Z\"}}")]
    [InlineData("{\"v\":1,\"sessionToken\":\"sks_x\",\"cache\":{\"result\":{\"signedIn\":\"yes\"},\"storedAt\":\"2999-01-01T00:00:00Z\"}}")]
    [InlineData("{\"v\":1,\"sessionToken\":\"sks_x\",\"cache\":{\"result\":" + Ok + ",\"storedAt\":[]}}")]
    [InlineData("{\"v\":1,\"sessionToken\":\"sks_x\",\"nags\":[1]}")]
    [InlineData("{\"v\":1,\"sessionToken\":\"sks_x\",\"nags\":{\"a\":5,\"b\":{\"runs\":1e40}}}")]
    public async Task A_malformed_part_reads_as_absent_without_losing_the_rest(string document)
    {
        SponsorkitClient.ResetProcessState();
        var sk = new SponsorkitClient(Options(new Storage { Initial = document }, new Handler((_, _) => Task.FromResult(Json(HttpStatusCode.ServiceUnavailable, "")))));
        Assert.True(sk.IsSignedIn());
        var fc = await sk.GetFinancialContributionAsync();
        Assert.True(fc.SignedIn);
        Assert.False(fc.FromCache);
        Assert.Equal(0, sk.ReadNag("a").Runs);
    }

    [Fact]
    public void Invalid_utf8_or_unpaired_surrogates_read_as_absent()
    {
        Directory.CreateDirectory(_dir);
        var o = Options(new Storage(), Hanging());
        o.Storage = null;
        o.StorageDirectory = _dir;
        var sk = new SponsorkitClient(o);
        var bytes = new List<byte>(Encoding.UTF8.GetBytes("{\"v\":1,\"sessionToken\":\"sks_x\",\"nags\":{\"a"));
        bytes.AddRange(new byte[] { 0xC3, 0x28 });
        bytes.AddRange(Encoding.UTF8.GetBytes("\":{\"runs\":1}}}"));
        File.WriteAllBytes(Path.Combine(_dir, sk.TargetsHash + ".json"), bytes.ToArray());
        Assert.False(sk.IsSignedIn());

        var custom = new SponsorkitClient(Options(new Storage { Initial = "{\"v\":1,\"sessionToken\":\"sks_x\",\"nags\":{\"\ud800\":{\"runs\":1}}}" }, Hanging()));
        Assert.False(custom.IsSignedIn());
    }

    [Theory]
    [InlineData("2999-01-01T00:00:00Z")]
    [InlineData("2999-01-01T00:00:00.1Z")]
    [InlineData("2999-01-01T00:00:00.123Z")]
    [InlineData("2999-01-01T00:00:00.1234567Z")]
    [InlineData("2999-01-01T00:00:00.123456789Z")]
    [InlineData("2999-01-01T00:00:00.123456789012345+00:00")]
    public async Task Timestamps_with_any_fraction_length_are_accepted(string storedAt)
    {
        var sk = new SponsorkitClient(Options(new Storage { Initial = Doc("sks_x", Ok, storedAt) }, Hanging()));
        var fc = await sk.GetFinancialContributionAsync();
        Assert.True(fc.FromCache);
        Assert.False(fc.Stale);
    }

    [Fact]
    public async Task A_refresh_does_not_resurrect_a_token_replaced_during_the_request()
    {
        var storage = new Storage { Initial = Doc("sks_old") };
        SponsorkitClient? sk = null;
        var handler = new Handler((_, _) =>
        {
            // A concurrent sign-out lands while the request is in flight.
            sk!.SignOutAsync(CancellationToken.None).GetAwaiter().GetResult();
            var res = Json(HttpStatusCode.OK, Ok);
            res.Headers.TryAddWithoutValidation("Sponsorkit-Session", "sks_renewed");
            return Task.FromResult(res);
        });
        sk = new SponsorkitClient(Options(storage, handler));
        await sk.GetFinancialContributionAsync(TimeSpan.Zero);
        Assert.False(sk.IsSignedIn());
        Assert.DoesNotContain("sks_", storage.Read(sk.TargetsHash), StringComparison.Ordinal);
        Assert.DoesNotContain("cache", storage.Read(sk.TargetsHash), StringComparison.Ordinal);

        // A concurrent sign-in to another session keeps that session and its cache.
        storage = new Storage { Initial = Doc("sks_old") };
        handler = new Handler((_, _) =>
        {
            storage.Write(sk!.TargetsHash, Doc("sks_other", Ok, "2999-01-01T00:00:00Z"));
            var res = Json(HttpStatusCode.OK, "{\"signedIn\":true,\"targets\":[\"github:octocat\"],\"contributions\":[],\"fetchedAt\":\"2001-01-01T00:00:00Z\"}");
            res.Headers.TryAddWithoutValidation("Sponsorkit-Session", "sks_renewed");
            return Task.FromResult(res);
        });
        sk = new SponsorkitClient(Options(storage, handler));
        await sk.GetFinancialContributionAsync(TimeSpan.Zero);
        var after = storage.Read(sk.TargetsHash)!;
        Assert.Contains("sks_other", after, StringComparison.Ordinal);
        Assert.DoesNotContain("2001-01-01", after, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_401_clears_only_the_token_the_request_used()
    {
        var storage = new Storage { Initial = Doc("sks_old") };
        SponsorkitClient? sk = null;
        var handler = new Handler((_, _) =>
        {
            storage.Write(sk!.TargetsHash, Doc("sks_other", Ok, "2999-01-01T00:00:00Z"));
            return Task.FromResult(Json(HttpStatusCode.Unauthorized, "{\"code\":\"session_invalid\"}"));
        });
        sk = new SponsorkitClient(Options(storage, handler));
        await sk.GetFinancialContributionAsync(TimeSpan.Zero);
        Assert.True(sk.IsSignedIn());
        Assert.Contains("sks_other", storage.Read(sk.TargetsHash), StringComparison.Ordinal);
    }

    [Fact]
    public void Without_a_config_directory_storage_is_in_memory_and_never_the_working_directory()
    {
        Assert.Null(FileStorage.DefaultDirectory(_ => null, _ => ""));
        Assert.Null(FileStorage.DefaultDirectory(n => n == "HOME" ? "relative/home" : null, _ => "also-relative"));
        Assert.Null(FileStorage.DefaultDirectory(_ => null, _ => throw new PlatformNotSupportedException()));
        if (!OperatingSystem.IsWindows() && !OperatingSystem.IsMacOS())
        {
            Assert.Equal(Path.Combine("/xdg", "sponsorkit"), FileStorage.DefaultDirectory(n => n == "XDG_CONFIG_HOME" ? "/xdg" : null, _ => ""));
            Assert.Equal(Path.Combine("/home/u", ".config", "sponsorkit"), FileStorage.DefaultDirectory(n => n == "HOME" ? "/home/u" : null, _ => ""));
        }
    }

    [Fact]
    public async Task Without_a_config_directory_the_client_constructs_and_keeps_state_in_memory()
    {
        FileStorage.TestDefaultDirectory.Value = () => null;
        try
        {
            var o = Options(new Storage(), new Handler((_, _) => Task.FromResult(Json(HttpStatusCode.OK, TokenBody))));
            o.Storage = null;
            var cwd = Directory.GetFileSystemEntries(Directory.GetCurrentDirectory()).Length;
            var sk = new SponsorkitClient(o);
            Assert.False(sk.IsSignedIn());
            await sk.SignInAsync();
            Assert.True(sk.IsSignedIn());
            await sk.SignOutAsync();
            Assert.False(sk.IsSignedIn());
            Assert.Equal(cwd, Directory.GetFileSystemEntries(Directory.GetCurrentDirectory()).Length);
        }
        finally
        {
            FileStorage.TestDefaultDirectory.Value = null;
        }
    }
}
