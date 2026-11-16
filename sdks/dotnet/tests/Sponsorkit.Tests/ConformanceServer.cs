using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace Sponsorkit.Tests;

/// <summary>Starts <c>bun sdks/conformance/server.ts</c> once for the test class and stops it afterwards.</summary>
public sealed class ConformanceServer : IAsyncLifetime
{
    private Process? _process;

    public string BaseUrl { get; private set; } = "";

    public string StorageRoot { get; } = Path.Combine(Path.GetTempPath(), "sponsorkit-dotnet-" + Guid.NewGuid().ToString("N")[..8]);

    public HttpClient Http { get; } = new() { Timeout = TimeSpan.FromSeconds(60) };

    public async Task InitializeAsync()
    {
        Directory.CreateDirectory(StorageRoot);
        var psi = new ProcessStartInfo("bun", [Path.Combine(Paths.ConformanceDir, "server.ts"), "--port", "0"])
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = false,
            UseShellExecute = false,
            WorkingDirectory = Paths.ConformanceDir,
        };
        psi.Environment["SPONSORKIT_CONFORMANCE_EXIT_ON_STDIN_EOF"] = "1";
        _process = Process.Start(psi) ?? throw new InvalidOperationException("Could not start bun");
        var line = await _process.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(60));
        var m = Regex.Match(line ?? "", "^LISTENING (\\d+)$");
        if (!m.Success) throw new InvalidOperationException($"Unexpected server output: {line}");
        BaseUrl = "http://127.0.0.1:" + m.Groups[1].Value;
    }

    public async Task<JsonNode> CallAsync(HttpMethod method, string path, JsonNode? body = null)
    {
        using var req = new HttpRequestMessage(method, BaseUrl + path);
        if (body is not null) req.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
        using var res = await Http.SendAsync(req);
        var text = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode) throw new InvalidOperationException($"{method} {path} -> {(int)res.StatusCode}: {text}");
        return JsonNode.Parse(text)!;
    }

    public Task DisposeAsync()
    {
        try
        {
            if (_process is { HasExited: false })
            {
                _process.StandardInput.Close();
                if (!_process.WaitForExit(5000)) _process.Kill(entireProcessTree: true);
            }
        }
        catch (Exception)
        {
        }
        _process?.Dispose();
        Http.Dispose();
        try
        {
            Directory.Delete(StorageRoot, recursive: true);
        }
        catch (Exception)
        {
        }
        return Task.CompletedTask;
    }
}
