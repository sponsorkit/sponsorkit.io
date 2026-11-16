using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Internal;

/// <summary>
/// A minimal HTTP/1.1 server on <c>127.0.0.1:0</c> that waits for <c>GET /callback?code=…</c> or <c>?error=…</c>
/// (PROTOCOL §7, native loopback sign-in).
/// </summary>
internal sealed class LoopbackServer : IDisposable
{
    private const string ClosePage =
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Sponsorkit</title></head>" +
        "<body style=\"font-family:system-ui,sans-serif;text-align:center;padding:3em\">" +
        "<h1>You're signed in</h1><p>You can close this window and return to the app.</p></body></html>";

    private const string ErrorPage =
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Sponsorkit</title></head>" +
        "<body style=\"font-family:system-ui,sans-serif;text-align:center;padding:3em\">" +
        "<h1>Sign-in did not complete</h1><p>You can close this window and return to the app.</p></body></html>";

    private readonly TcpListener _listener;
    private readonly string? _redirectAfterCode;
    private readonly TaskCompletionSource<CallbackResult> _result = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly CancellationTokenSource _stop = new();
    private int _disposed;
    private int _claimed;

    /// <param name="redirectAfterCode">When set, a successful callback answers <c>302</c> to this URL (checkout continues).</param>
    public LoopbackServer(string? redirectAfterCode = null)
    {
        _redirectAfterCode = redirectAfterCode;
        _listener = new TcpListener(TestBindAddress.Value ?? IPAddress.Loopback, 0);
        _listener.Start();
        Port = ((IPEndPoint)_listener.LocalEndpoint).Port;
        _ = AcceptLoopAsync();
    }

    /// <summary>Tests only: binds to another address (one that cannot be bound simulates a bind failure).</summary>
    internal static readonly AsyncLocal<IPAddress?> TestBindAddress = new();

    public int Port { get; }

    public string RedirectUri => "http://127.0.0.1:" + Port.ToString(System.Globalization.CultureInfo.InvariantCulture) + "/callback";

    /// <summary>Completes with the first callback carrying <c>code</c> or <c>error</c>.</summary>
    public Task<CallbackResult> Result => _result.Task;

    private async Task AcceptLoopAsync()
    {
        while (!_stop.IsCancellationRequested)
        {
            TcpClient client;
            try
            {
                client = await _listener.AcceptTcpClientAsync().ConfigureAwait(false);
            }
            catch (ObjectDisposedException)
            {
                return;
            }
            catch (SocketException)
            {
                if (_stop.IsCancellationRequested) return;
                continue;
            }
            catch (InvalidOperationException)
            {
                return;
            }
            _ = HandleAsync(client);
        }
    }

    private async Task HandleAsync(TcpClient client)
    {
        using (client)
        {
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(_stop.Token);
                timeout.CancelAfter(TimeSpan.FromSeconds(30));
                var stream = client.GetStream();
                var target = await ReadRequestTargetAsync(stream, timeout.Token).ConfigureAwait(false);
                if (target is null) return;
                await RespondAsync(stream, target, timeout.Token).ConfigureAwait(false);
            }
            catch (IOException)
            {
            }
            catch (OperationCanceledException)
            {
            }
            catch (ObjectDisposedException)
            {
            }
            catch (SocketException)
            {
            }
        }
    }

    private static async Task<string?> ReadRequestTargetAsync(NetworkStream stream, CancellationToken ct)
    {
        var buffer = new byte[8192];
        var total = 0;
        using var reg = ct.Register(stream.Dispose);
        while (total < buffer.Length)
        {
            var n = await stream.ReadAsync(buffer, total, buffer.Length - total, ct).ConfigureAwait(false);
            if (n == 0) break;
            total += n;
            var text = Encoding.ASCII.GetString(buffer, 0, total);
            if (text.Contains("\r\n\r\n") || text.Contains("\n\n"))
            {
                var line = text.Substring(0, text.IndexOf('\n')).TrimEnd('\r');
                var parts = line.Split(' ');
                return parts.Length >= 2 && parts[0] == "GET" ? parts[1] : "";
            }
        }
        return null;
    }

    private async Task RespondAsync(NetworkStream stream, string target, CancellationToken ct)
    {
        var q = target.IndexOf('?');
        var path = q >= 0 ? target.Substring(0, q) : target;
        if (path != "/callback")
        {
            await WriteAsync(stream, "404 Not Found", "text/plain; charset=utf-8", "Not found", null, ct).ConfigureAwait(false);
            return;
        }
        var query = QueryString.Parse(q >= 0 ? target.Substring(q + 1) : "");
        query.TryGetValue("code", out var code);
        query.TryGetValue("error", out var error);
        if (string.IsNullOrEmpty(code) && string.IsNullOrEmpty(error))
        {
            await WriteAsync(stream, "400 Bad Request", "text/plain; charset=utf-8", "Missing code", null, ct).ConfigureAwait(false);
            return;
        }
        var first = Interlocked.Exchange(ref _claimed, 1) == 0;
        var callback = new CallbackResult(string.IsNullOrEmpty(code) ? null : code, string.IsNullOrEmpty(error) ? null : error);
        try
        {
            // Answer the browser before completing Result: the caller disposes the server as soon as Result
            // completes, which would cancel this write and lose the close page or the checkout 302.
            if (first && !string.IsNullOrEmpty(code) && _redirectAfterCode is not null)
                await WriteAsync(stream, "302 Found", "text/plain; charset=utf-8", "", _redirectAfterCode, ct).ConfigureAwait(false);
            else
                await WriteAsync(stream, "200 OK", "text/html; charset=utf-8", string.IsNullOrEmpty(code) ? ErrorPage : ClosePage, null, ct).ConfigureAwait(false);
        }
        finally
        {
            // The code is delivered even if the browser went away before reading the response.
            if (first) _result.TrySetResult(callback);
        }
    }

    private static async Task WriteAsync(NetworkStream stream, string status, string contentType, string body, string? location, CancellationToken ct)
    {
        var bodyBytes = Encoding.UTF8.GetBytes(body);
        var head = new StringBuilder()
            .Append("HTTP/1.1 ").Append(status).Append("\r\n")
            .Append("Content-Type: ").Append(contentType).Append("\r\n")
            .Append("Content-Length: ").Append(bodyBytes.Length.ToString(System.Globalization.CultureInfo.InvariantCulture)).Append("\r\n")
            .Append("Cache-Control: no-store\r\n")
            .Append("Referrer-Policy: no-referrer\r\n")
            .Append("Connection: close\r\n");
        if (location is not null) head.Append("Location: ").Append(location).Append("\r\n");
        head.Append("\r\n");
        var headBytes = Encoding.ASCII.GetBytes(head.ToString());
        await stream.WriteAsync(headBytes, 0, headBytes.Length, ct).ConfigureAwait(false);
        await stream.WriteAsync(bodyBytes, 0, bodyBytes.Length, ct).ConfigureAwait(false);
        await stream.FlushAsync(ct).ConfigureAwait(false);
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) == 1) return;
        _stop.Cancel();
        _listener.Stop();
        _stop.Dispose();
    }
}

internal sealed class CallbackResult
{
    public CallbackResult(string? code, string? error)
    {
        Code = code;
        Error = error;
    }

    public string? Code { get; }

    public string? Error { get; }
}

internal static class QueryString
{
    public static Dictionary<string, string> Parse(string query)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var part in query.Split('&'))
        {
            if (part.Length == 0) continue;
            var eq = part.IndexOf('=');
            var key = Decode(eq >= 0 ? part.Substring(0, eq) : part);
            var value = eq >= 0 ? Decode(part.Substring(eq + 1)) : "";
            result[key] = value;
        }
        return result;
    }

    private static string Decode(string s) => Uri.UnescapeDataString(s.Replace('+', ' '));

    /// <summary>Builds <c>a=1&amp;b=2</c> with RFC 3986 escaping, skipping null values.</summary>
    public static string Build(IEnumerable<KeyValuePair<string, string?>> pairs)
    {
        var sb = new StringBuilder();
        foreach (var kv in pairs)
        {
            if (kv.Value is null) continue;
            if (sb.Length > 0) sb.Append('&');
            sb.Append(Uri.EscapeDataString(kv.Key)).Append('=').Append(Uri.EscapeDataString(kv.Value));
        }
        return sb.ToString();
    }
}
