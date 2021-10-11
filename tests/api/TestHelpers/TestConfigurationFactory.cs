using System;
using System.Linq;
using Amazon.Extensions.Configuration.SystemsManager;
using Microsoft.Extensions.Configuration;
using Sponsorkit.Infrastructure;

namespace Sponsorkit.Tests.TestHelpers
{
    public static class TestConfigurationFactory
    {
        public static IConfigurationBuilder ConfigureBuilder(IConfigurationBuilder builder)
        {
            ConfigurationFactory.Configure(
                builder,
                Array.Empty<string>(),
                null);
            
            foreach (var source in builder.Sources.ToArray())
            {
                if (source is ChainedConfigurationSource or SystemsManagerConfigurationSource)
                    continue;

                builder.Sources.Remove(source);
            }

            builder
                .AddJsonFile("appsettings.json", false)
                .AddJsonFile($"appsettings.{Microsoft.Extensions.Hosting.Environments.Development}.json", false);

            return builder;
        }
    }
}
