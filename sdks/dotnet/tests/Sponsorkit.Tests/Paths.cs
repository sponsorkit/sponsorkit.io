using System;
using System.IO;

namespace Sponsorkit.Tests;

/// <summary>Locates the shared conformance kit (<c>sdks/conformance</c>) from the test output directory.</summary>
internal static class Paths
{
    private static readonly Lazy<string> Kit = new(() =>
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "sdks", "conformance");
            if (File.Exists(Path.Combine(candidate, "scenarios.json"))) return candidate;
            candidate = Path.Combine(dir.FullName, "conformance");
            if (File.Exists(Path.Combine(candidate, "scenarios.json"))) return candidate;
            dir = dir.Parent;
        }
        throw new InvalidOperationException("Could not find sdks/conformance/scenarios.json above " + AppContext.BaseDirectory);
    });

    public static string ConformanceDir => Kit.Value;

    public static string Fixture(string name) => Path.Combine(ConformanceDir, "fixtures", name);
}
