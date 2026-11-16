using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
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

    /// <summary>Opens <paramref name="url"/> in the system browser. Throws if no browser could be launched.</summary>
    public static Task OpenSystemBrowser(string url, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
            throw new ArgumentException("Only http(s) URLs can be opened.", nameof(url));
        ProcessStartInfo psi;
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            psi = new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true };
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            psi = new ProcessStartInfo("open", Quote(uri.AbsoluteUri)) { UseShellExecute = false };
        else
            psi = new ProcessStartInfo("xdg-open", Quote(uri.AbsoluteUri)) { UseShellExecute = false };
        psi.RedirectStandardError = !psi.UseShellExecute;
        psi.RedirectStandardOutput = !psi.UseShellExecute;
        using var process = Process.Start(psi) ?? throw new InvalidOperationException("Could not start the browser.");
        return Task.CompletedTask;
    }

    private static string Quote(string s) => "\"" + s.Replace("\"", "%22") + "\"";

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

    public static async Task<string> ReadCodeFromStdin(string url, CancellationToken cancellationToken)
    {
        _ = url;
        await Console.Error.WriteAsync("Paste the code shown on that page and press Enter: ").ConfigureAwait(false);
        var read = Task.Run(Console.In.ReadLine, CancellationToken.None);
        var cancelled = Task.Delay(Timeout.Infinite, cancellationToken);
        var done = await Task.WhenAny(read, cancelled).ConfigureAwait(false);
        if (done != read) cancellationToken.ThrowIfCancellationRequested();
        var line = await read.ConfigureAwait(false);
        return line ?? throw new SponsorkitError(SponsorkitErrorCodes.Cancelled, "No sign-in code was entered.");
    }
}
