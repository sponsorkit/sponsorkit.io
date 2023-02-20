using System;
using Microsoft.Extensions.Configuration;
using Sponsorkit.BusinessLogic.Infrastructure;

namespace Sponsorkit.Tests.TestHelpers;

public static class TestConfigurationFactory
{
    public static IConfigurationBuilder ConfigureBuilder(ConfigurationManager builder)
    {
        ConfigurationFactory.Configure(
            builder,
            Array.Empty<string>(),
            null);

        builder
            .AddJsonFile("appsettings.json", false)
            .AddJsonFile($"appsettings.{Microsoft.Extensions.Hosting.Environments.Development}.json", false);

        return builder;
    }
}