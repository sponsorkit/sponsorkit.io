using System;
using System.Diagnostics;
using Amazon;
using Microsoft.Extensions.Configuration;

namespace Sponsorkit.Infrastructure;

public static class ConfigurationFactory
{
    public static void Configure(
        ConfigurationManager configurationBuilder, 
        string[] args, 
        string? secretId)
    {
        var environment = GetEnvironmentName();

        configurationBuilder.AddJsonFile("appsettings.json");
        configurationBuilder.AddEnvironmentVariables();
        configurationBuilder.AddCommandLine(args);

        if (EnvironmentHelper.IsRunningInTest)
        {
            configurationBuilder.AddJsonFile($"appsettings.Development.json");
        }
        else if (Debugger.IsAttached)
        {
            configurationBuilder.AddJsonFile($"appsettings.{environment}.json");

            if (secretId != null)
                configurationBuilder.AddUserSecrets(secretId);
        }
        else
        {
            Console.WriteLine("Warning: Assuming production mode.");
        }
    }

    private static string GetEnvironmentName()
    {
        return Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development";
    }
}