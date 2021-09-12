using System;
using System.Diagnostics;
using Amazon;
using Amazon.Extensions.NETCore.Setup;
using Microsoft.Extensions.Configuration;

namespace Sponsorkit.Infrastructure
{
    public static class ConfigurationFactory
    {
        public static IConfigurationRoot BuildConfiguration(string? secretId, string[] args)
        {
            var configurationBuilder = new ConfigurationBuilder();

            var environment = GetEnvironmentName();
            configurationBuilder.AddSystemsManager(configureSource =>
            {
                configureSource.Path = $"/sponsorkit/{environment}";
                configureSource.ReloadAfter = TimeSpan.FromHours(24);
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
            
            if (Debugger.IsAttached && !EnvironmentHelper.IsRunningInTest)
            {
                configurationBuilder.AddJsonFile($"appsettings.{environment}.json");

                if (secretId != null)
                    configurationBuilder.AddUserSecrets(secretId);
            }
            else
            {
                Console.WriteLine("Warning: Assuming production mode.");
            }

            var configuration = configurationBuilder.Build();
            return configuration;
        }

        private static string GetEnvironmentName()
        {
            return Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development";
        }
    }
}