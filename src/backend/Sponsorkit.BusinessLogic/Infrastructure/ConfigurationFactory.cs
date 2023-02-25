using System.Diagnostics;
using Amazon;
using Amazon.Extensions.NETCore.Setup;
using Microsoft.Extensions.Configuration;

namespace Sponsorkit.BusinessLogic.Infrastructure;

public static class ConfigurationFactory
{
    public static void Configure(
        IConfigurationBuilder configurationBuilder, 
        string[] args, 
        string? secretId)
    {
        var environment = GetEnvironmentName();
        configurationBuilder.AddSystemsManager(configureSource =>
        {
            configureSource.Path = $"/sponsorkit/{environment}";
            configureSource.ReloadAfter = TimeSpan.FromDays(7);
            configureSource.Optional = false;
            configureSource.AwsOptions = new AWSOptions()
            {
                Region = RegionEndpoint.EUNorth1
            };

            configureSource.OnLoadException += exceptionContext =>
            {
                exceptionContext.Ignore = false;
                throw exceptionContext.Exception;
            };
        });

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