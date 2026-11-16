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

/// <summary>Malformed storage, malformed API bodies, storage failures and platform edge cases.</summary>
public sealed class RobustnessTests : IDisposable
{
    private const string Ok = "{\"signedIn\":true,\"targets\":[\"github:octocat\"],\"contributions\":[]}";
    private const string OneContribution =
        "{\"signedIn\":true,\"targets\":[\"github:octocat\"],\"contributions\":[{\"id\":\"c1\",\"provider\":\"github\",\"target\":\"github:octocat\"," +
        "\"sponsor\":{\"type\":\"user\",\"provider\":\"github\",\"id\":\"1\"},\"via\":\"direct\",\"kind\":\"recurring\",\"frequency\":\"monthly\"," +
        "\"status\":\"active\",\"amount\":{\"value\":500,\"currency\":\"USD\"},\"flags\":[]}]}";

    private readonly string _dir = Path.Combine(Path.GetTempPath(), "sponsorkit-dotnet-robust-" + Guid.NewGuid().ToString("N")[..8]);

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

    private sealed class Storage : ISponsorkitStorage
    {
        private readonly ConcurrentDictionary<string, string> _data = new();

        public string? Initial { get; set; }

        public bool FailWrites { get; set; }

        public string? Read(string key) => _data.TryGetValue(key, out var v) ? v : Initial;

        public void Write(string key, string json)
        {
            if (FailWrites) throw new IOException("disk full");
            _data[key] = json;
        }
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, string> _body;

        public StubHandler(Func<HttpRequestMessage, string> body)
        {
            _body = body;
        }

        public int Requests { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests++;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_body(request), Encoding.UTF8, "application/json"),
            });
        }
    }

    private static SponsorkitClient Client(ISponsorkitStorage storage, HttpMessageHandler? handler = null, Func<string, CancellationToken, Task<string>>? prompt = null) =>
        new(new SponsorkitOptions
        {
            GitHub = "octocat",
            Storage = storage,
            ApiBaseUrl = handler is null ? UnreachableBaseUrl() : "http://sponsorkit.test",
            HttpClient = handler is null ? null : new HttpClient(handler),
            Environment = new Dictionary<string, string>(),
            DevChecks = false,
            Interactive = true,
            SignInMethod = SignInMethod.Paste,
            PromptForCode = prompt,
        });

    public static TheoryData<string> CorruptDocuments() => new()
    {
        "{\"v\":1,\"sessionToken\":\"sks_x\",\"cache\":{\"result\":{\"contributions\":[]},\"storedAt\":\"garbage\"}}",
        "{\"v\":1,\"sessionToken\":\"sks_x\",\"cache\":{\"result\":{\"contributions\":[]},\"storedAt\":5}}",
        "{\"v\":1,\"sessionToken\":\"sks_x\",\"cache\":{\"result\":{\"signedIn\":true,\"contributions\":null},\"storedAt\":\"2999-01-01T00:00:00Z\"}}",
        "{\"v\":1,\"sessionToken\":\"sks_x\",\"cache\":{\"result\":{\"signedIn\":true,\"contributions\":[null]},\"storedAt\":\"2999-01-01T00:00:00Z\"}}",
        "{\"v\":1,\"sessionToken\":\"sks_x\",\"cache\":{\"result\":{\"signedIn\":true,\"targets\":null},\"storedAt\":\"2999-01-01T00:00:00Z\"}}",
        "{\"v\":1,\"sessionToken\":\"sks_x\",\"nags\":{\"my-cli\":null}}",
        "{\"v\":1,\"sessionToken\":\"sks_x\",\"nags\":{\"my-cli\":{\"runs\":3,\"lastShown\":\"zzz\"}}}",
        "{\"v\":1,\"sessionToken\":\"sks_x\",\"nags\":{\"my-cli\":{\"runs\":\"three\"}}}",
        "[1,2,3]",
        "{\"v\":\"one\"}",
    };

    [Theory]
    [MemberData(nameof(CorruptDocuments))]
    public async Task Corrupt_storage_never_throws_and_sign_out_clears_it(string document)
    {
        SponsorkitClient.ResetProcessState();
        var storage = new Storage { Initial = document };
        var sk = Client(storage);
        _ = sk.IsSignedIn();
        var fc = await sk.GetFinancialContributionAsync();
        Assert.Empty(fc.Active());
        var nag = sk.Nag(new NagOptions("my-cli") { Every = 1, OrEvery = TimeSpan.FromDays(1) });
        _ = await nag.DueAsync(_ => true, force: true);
        nag.Shown();
        await sk.SignOutAsync();
        Assert.False(sk.IsSignedIn());
        Assert.False((await sk.GetFinancialContributionAsync()).SignedIn);
        SponsorkitClient.ResetProcessState();
    }

    [Fact]
    public async Task A_bad_cache_date_drops_only_the_cache()
    {
        var storage = new Storage { Initial = "{\"v\":1,\"sessionToken\":\"sks_x\",\"cache\":{\"result\":" + Ok + ",\"storedAt\":\"garbage\"},\"nags\":{\"a\":{\"runs\":2,\"lastShown\":null}}}" };
        var sk = Client(storage);
        Assert.True(sk.IsSignedIn());
        var fc = await sk.GetFinancialContributionAsync();
        Assert.True(fc.SignedIn);
        Assert.True(fc.Stale);
        Assert.False(fc.FromCache);
        Assert.Equal(2, sk.ReadNag("a").Runs);
    }

    [Theory]
    [InlineData("{\"signedIn\":true,\"targets\":[\"github:octocat\"],\"contributions\":null}")]
    [InlineData("{\"signedIn\":true,\"targets\":[\"github:octocat\"],\"contributions\":[null]}")]
    [InlineData("{\"signedIn\":true,\"targets\":null,\"contributions\":[]}")]
    [InlineData("{\"signedIn\":true,\"targets\":[\"github:octocat\"],\"contributions\":[{\"id\":null,\"provider\":\"github\"}]}")]
    [InlineData("{\"signedIn\":true,\"targets\":[\"github:octocat\"],\"contributions\":[],\"supporter\":{\"id\":\"sup_1\",\"identities\":null}}")]
    public async Task A_malformed_contributions_body_is_an_unexpected_response(string body)
    {
        var handler = new StubHandler(_ => body);
        var sk = Client(new Storage { Initial = "{\"v\":1,\"sessionToken\":\"sks_x\"}" }, handler);
        var fc = await sk.GetFinancialContributionAsync();
        Assert.True(fc.SignedIn);
        Assert.True(fc.Stale);
        Assert.Empty(fc.Active());
        // Not cached: the next call asks the API again.
        await sk.GetFinancialContributionAsync();
        Assert.Equal(2, handler.Requests);

        var e = await Assert.ThrowsAsync<SponsorkitError>(() => SponsorkitServer.VerifySessionAsync(
            "sks_x", new VerifySessionOptions { GitHub = "octocat", ApiBaseUrl = "http://sponsorkit.test", HttpClient = new HttpClient(new StubHandler(_ => body)) }));
        Assert.Equal(SponsorkitErrorCodes.NetworkError, e.Code);
    }

    [Fact]
    public async Task A_malformed_partial_outage_body_falls_back_to_the_cache()
    {
        var storage = new Storage
        {
            Initial = "{\"v\":1,\"sessionToken\":\"sks_x\",\"cache\":{\"result\":" + OneContribution + ",\"storedAt\":\"2000-01-01T00:00:00Z\"}}",
        };
        var sk = Client(storage, new StubHandler(_ => "{\"signedIn\":true,\"targets\":[\"github:octocat\"],\"contributions\":[null],\"unavailable\":[\"github\"]}"));
        var fc = await sk.GetFinancialContributionAsync();
        Assert.True(fc.FromCache);
        Assert.True(fc.Stale);
        Assert.Single(fc.Active());
    }

    [Fact]
    public async Task A_malformed_token_response_is_a_network_error()
    {
        var sk = Client(
            new Storage(),
            new StubHandler(_ => "{\"sessionToken\":\"sks_new\",\"result\":{\"signedIn\":true,\"targets\":[\"github:octocat\"],\"contributions\":null}}"),
            (_, _) => Task.FromResult("skc_code"));
        var e = await Assert.ThrowsAsync<SponsorkitError>(() => sk.SignInAsync());
        Assert.Equal(SponsorkitErrorCodes.NetworkError, e.Code);
        Assert.False(sk.IsSignedIn());
    }

    [Fact]
    public async Task Storage_failures_in_sign_in_and_sign_out_are_sponsorkit_errors()
    {
        var storage = new Storage { FailWrites = true };
        var sk = Client(
            storage,
            new StubHandler(r => r.RequestUri!.AbsolutePath == "/api/v1/auth/token" ? "{\"sessionToken\":\"sks_new\",\"result\":" + Ok + "}" : Ok),
            (_, _) => Task.FromResult("skc_code"));
        var signIn = await Assert.ThrowsAsync<SponsorkitError>(() => sk.SignInAsync());
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, signIn.Code);
        Assert.IsType<IOException>(signIn.InnerException);

        storage.Initial = "{\"v\":1,\"sessionToken\":\"sks_x\"}";
        var signOut = await Assert.ThrowsAsync<SponsorkitError>(() => sk.SignOutAsync());
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, signOut.Code);

        // Reads keep working and never throw.
        Assert.True((await sk.GetFinancialContributionAsync()).SignedIn);
    }

    [Fact]
    public async Task Loopback_server_answers_before_the_result_completes()
    {
        const string redirect = "http://example.invalid/checkout?step=choose";
        for (var i = 0; i < 100; i++)
        {
            var server = new LoopbackServer(redirect);
            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, server.Port);
            var stream = client.GetStream();
            var request = Encoding.ASCII.GetBytes("GET /callback?code=abc HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
            await stream.WriteAsync(request);
            // The same sequence as SponsorkitClient.LoopbackAsync: await the code, then dispose the server.
            var result = await server.Result;
            server.Dispose();
            Assert.Equal("abc", result.Code);
            using var reader = new StreamReader(stream, Encoding.ASCII);
            var response = await reader.ReadToEndAsync();
            Assert.StartsWith("HTTP/1.1 302 Found", response, StringComparison.Ordinal);
            Assert.Contains("Location: " + redirect, response, StringComparison.Ordinal);
        }
    }

    private sealed class BlockingReader : TextReader
    {
        private readonly BlockingCollection<string?> _lines = new();

        public int Reads;

        public void Send(string? line) => _lines.Add(line);

        public override string? ReadLine()
        {
            Interlocked.Increment(ref Reads);
            return _lines.Take();
        }
    }

    [Fact]
    public async Task A_cancelled_line_read_is_handed_to_the_next_reader()
    {
        var source = new BlockingReader();
        var reader = new SharedLineReader(() => source);
        using (var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100)))
        {
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => reader.ReadLineAsync(cts.Token));
        }
        using (var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100)))
        {
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => reader.ReadLineAsync(cts.Token));
        }
        var next = reader.ReadLineAsync(CancellationToken.None);
        source.Send("skc_line");
        Assert.Equal("skc_line", await next);
        Assert.Equal(1, source.Reads);
        source.Send(null);
        Assert.Null(await reader.ReadLineAsync(CancellationToken.None));
        Assert.Equal(2, source.Reads);
    }

    private string Script(string name, string body)
    {
        Directory.CreateDirectory(_dir);
        var path = Path.Combine(_dir, name);
        File.WriteAllText(path, "#!/bin/sh\n" + body + "\n");
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        return path;
    }

    [Fact]
    public async Task A_failing_opener_throws_so_auto_sign_in_can_fall_back()
    {
        if (OperatingSystem.IsWindows()) return;
        var failing = Script("fail-open", "exit 3");
        await Assert.ThrowsAsync<InvalidOperationException>(() => Platform.OpenSystemBrowser("https://example.com/connect?a=1&b=\"x\"", CancellationToken.None, failing));
        await Assert.ThrowsAsync<InvalidOperationException>(() => Platform.OpenSystemBrowser("https://example.com/", CancellationToken.None, Path.Combine(_dir, "missing-opener")));
    }

    [Fact]
    public async Task A_browser_started_by_the_opener_keeps_working_output()
    {
        if (OperatingSystem.IsWindows()) return;
        var marker = Path.Combine(_dir, "marker");
        var args = Path.Combine(_dir, "args");
        // The opener records its argument, then leaves a "browser" behind that logs to stderr after the opener exits.
        var opener = Script("ok-open", $"printf '%s' \"$1\" > '{args}'\n(sleep 0.5; echo log >&2; echo \"rc=$?\" > '{marker}') &\nexit 0");
        const string url = "https://example.com/connect?targets=github%3Aoctocat&app_name=a%20b";
        await Platform.OpenSystemBrowser(url, CancellationToken.None, opener);
        Assert.Equal(url, File.ReadAllText(args));
        var clock = Stopwatch.StartNew();
        while (!File.Exists(marker) && clock.Elapsed < TimeSpan.FromSeconds(10)) await Task.Delay(50);
        Assert.Equal("rc=0", File.ReadAllText(marker).Trim());
    }
}
