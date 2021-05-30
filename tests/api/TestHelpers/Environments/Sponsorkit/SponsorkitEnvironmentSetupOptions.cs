using System;
using Microsoft.Extensions.DependencyInjection;

namespace Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit
{
    class SponsorkitEnvironmentSetupOptions
    {
        public string EnvironmentName { get; init; }
        public Action<IServiceCollection> IocConfiguration { get; init; }
        public bool IncludeWebServer { get; init; }
    }
}
