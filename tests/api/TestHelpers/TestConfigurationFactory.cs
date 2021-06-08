using System.Linq;
using Microsoft.Extensions.Configuration;

namespace Sponsorkit.Tests.TestHelpers
{
    public static class TestConfigurationFactory
    {
        public static IConfigurationBuilder ConfigureBuilder(IConfigurationBuilder builder)
        {
            foreach (var source in builder.Sources.ToArray())
            {
                if (source is ChainedConfigurationSource)
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
