using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Internal;

/// <summary>Environment lookup with the per-instance override (PROTOCOL §7 <c>env</c>).</summary>
internal sealed class EnvReader
{
    private readonly IReadOnlyDictionary<string, string>? _override;

    public EnvReader(IReadOnlyDictionary<string, string>? overrideValues)
    {
        _override = overrideValues;
    }

    public string? Get(string name)
    {
        if (_override is not null) return _override.TryGetValue(name, out var v) ? v : null;
        return Environment.GetEnvironmentVariable(name);
    }

    /// <summary>Set means non-empty and not <c>0</c> or <c>false</c> (case-insensitive).</summary>
    public bool IsSet(string name) => IsTruthy(Get(name));

    public static bool IsTruthy(string? v) =>
        !string.IsNullOrEmpty(v) && v != "0" && !string.Equals(v, "false", StringComparison.OrdinalIgnoreCase);
}

internal static class Platform
{
    /// <summary>Whether a local browser can plausibly be opened (SPEC §6.2 auto-pick).</summary>
    public static bool CanOpenLocalBrowser()
    {
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("SSH_CONNECTION"))) return false;
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows) || RuntimeInformation.IsOSPlatform(OSPlatform.OSX)) return true;
        return !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("DISPLAY"))
            || !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WAYLAND_DISPLAY"));
    }

    /// <summary>How long to wait for <c>xdg-open</c>/<c>open</c> to report whether it could open the URL.</summary>
    internal static readonly TimeSpan OpenerExitWait = TimeSpan.FromSeconds(1.5);

    /// <summary>
    /// Opens <paramref name="url"/> in the system browser. Throws if no browser could be launched, including when
    /// <c>xdg-open</c>/<c>open</c> exits non-zero within <see cref="OpenerExitWait"/> (SPEC §6.2: Auto then falls back
    /// to paste-back). The opener's output goes to <c>/dev/null</c>, so a browser it starts inherits no pipes.
    /// </summary>
    /// <param name="url">An http(s) URL.</param>
    /// <param name="cancellationToken">Stops waiting for the opener.</param>
    /// <param name="opener">Overrides the opener command (tests); <c>null</c> picks <c>open</c> or <c>xdg-open</c>.</param>
    public static async Task OpenSystemBrowser(string url, CancellationToken cancellationToken, string? opener = null)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
            throw new ArgumentException("Only http(s) URLs can be opened.", nameof(url));
        if (opener is null && RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            using var shell = Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
            return;
        }
        opener ??= RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? "open" : "xdg-open";
        // sh redirects the opener's stdio to /dev/null (Process can only offer pipes, which a browser started by the
        // opener would inherit and later find closed) and reports a missing opener as exit status 127.
        var psi = new ProcessStartInfo("/bin/sh", "-c " + Quote("exec \"$0\" \"$1\" </dev/null >/dev/null 2>&1") + " " + Quote(opener) + " " + Quote(uri.AbsoluteUri))
        {
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var process = Process.Start(psi) ?? throw new InvalidOperationException("Could not start the browser.");
        var exited = Task.Run(() => process.WaitForExit((int)OpenerExitWait.TotalMilliseconds), CancellationToken.None);
        var cancelled = Task.Delay(Timeout.Infinite, cancellationToken);
        if (await Task.WhenAny(exited, cancelled).ConfigureAwait(false) != exited) cancellationToken.ThrowIfCancellationRequested();
        // Still running after the wait: some openers stay in the foreground with the browser; treat that as opened.
        if (await exited.ConfigureAwait(false) && process.ExitCode != 0)
            throw new InvalidOperationException($"{opener} exited with status {process.ExitCode}.");
    }

    /// <summary>Quotes one argument for <see cref="ProcessStartInfo.Arguments"/> (the MSVC rules .NET uses on every OS).</summary>
    internal static string Quote(string s)
    {
        var sb = new StringBuilder("\"");
        var backslashes = 0;
        foreach (var ch in s)
        {
            if (ch == '\\')
            {
                backslashes++;
                continue;
            }
            sb.Append('\\', ch == '"' ? (backslashes * 2) + 1 : backslashes);
            sb.Append(ch);
            backslashes = 0;
        }
        sb.Append('\\', backslashes * 2);
        return sb.Append('"').ToString();
    }

    /// <summary>Whether both stdout and stderr are interactive terminals.</summary>
    public static bool IsInteractiveTerminal()
    {
        try
        {
            return !Console.IsOutputRedirected && !Console.IsErrorRedirected;
        }
#pragma warning disable CA1031
        catch (Exception)
        {
            return false;
        }
#pragma warning restore CA1031
    }

    private static readonly SharedLineReader Stdin = new(() => Console.In);

    public static async Task<string> ReadCodeFromStdin(string url, CancellationToken cancellationToken)
    {
        _ = url;
        await Console.Error.WriteAsync("Paste the code shown on that page and press Enter: ").ConfigureAwait(false);
        var line = await Stdin.ReadLineAsync(cancellationToken).ConfigureAwait(false);
        return line ?? throw new SponsorkitError(SponsorkitErrorCodes.Cancelled, "No sign-in code was entered.");
    }
}

/// <summary>
/// Reads lines from a blocking <see cref="TextReader"/> with cancellation. A blocking console read cannot be
/// cancelled, so a cancelled caller leaves its read pending; the next caller is handed that same pending read (and
/// its line) instead of starting a second one. At most one read is ever outstanding, so repeated cancelled prompts
/// do not pile up blocked threads or each swallow a line.
/// </summary>
internal sealed class SharedLineReader
{
    private readonly Func<TextReader> _source;
    private readonly object _gate = new();
    private Task<string?>? _pending;

    public SharedLineReader(Func<TextReader> source)
    {
        _source = source;
    }

    public async Task<string?> ReadLineAsync(CancellationToken cancellationToken)
    {
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Task<string?> read;
            lock (_gate)
            {
                read = _pending ??= Task.Run<string?>(() => _source().ReadLine(), CancellationToken.None);
            }
            if (!read.IsCompleted)
            {
                var cancelled = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                using (cancellationToken.Register(() => cancelled.TrySetResult(true)))
                {
                    if (await Task.WhenAny(read, cancelled.Task).ConfigureAwait(false) != read)
                        cancellationToken.ThrowIfCancellationRequested();
                }
            }
            lock (_gate)
            {
                // Another concurrent caller may already have taken this line; then read the next one.
                if (!ReferenceEquals(_pending, read)) continue;
                _pending = null;
            }
            return await read.ConfigureAwait(false);
        }
    }
}
