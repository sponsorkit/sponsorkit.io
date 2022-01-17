using System;
using System.Diagnostics.CodeAnalysis;

namespace Sponsorkit.Infrastructure;

public static class EnvironmentHelper
{
    private const string IsRunningInTestEnvironmentVariableKey = "DOTNET_RUNNING_IN_TEST";

    public static bool IsRunningInTest => IsEnabled(IsRunningInTestEnvironmentVariableKey);
    public static bool IsRunningInContainer => IsEnabled("DOTNET_RUNNING_IN_CONTAINER");

    private static bool IsEnabled(string key)
    {
        return Environment.GetEnvironmentVariable(key) == "true";
    }

    [ExcludeFromCodeCoverage]
    public static void SetRunningInTestFlag()
    {
        Environment.SetEnvironmentVariable(
            IsRunningInTestEnvironmentVariableKey,
            "true");

        if (!IsRunningInTest)
            throw new InvalidOperationException("Could not set RunningInTest flag.");
    }
}