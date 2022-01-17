using System;
using Microsoft.Extensions.DependencyInjection;

namespace Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

class SponsorkitEnvironmentSetupOptions
{
    public string EnvironmentName { get; set; }
    public Action<IServiceCollection> IocConfiguration { get; set; }
    public bool IncludeWebServer { get; set; }
}