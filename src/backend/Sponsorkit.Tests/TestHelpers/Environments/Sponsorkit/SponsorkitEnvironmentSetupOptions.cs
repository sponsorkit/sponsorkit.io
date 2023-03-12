using System;
using Microsoft.Extensions.DependencyInjection;

namespace Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

public class SponsorkitEnvironmentSetupOptions : IEnvironmentSetupOptions
{
    public Action<IServiceCollection> IocConfiguration { get; set; }
    public int Port { get; set; } = 14568;
}