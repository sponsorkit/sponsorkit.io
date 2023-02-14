using System.Diagnostics;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.Hosting.Internal;
using Serilog;
using Sponsorkit;
using Sponsorkit.Infrastructure;
using Sponsorkit.Infrastructure.AspNet.HostedServices;
using Sponsorkit.Infrastructure.Ioc;

[assembly: InternalsVisibleTo("Sponsorkit.Tests")]

var configurationBuilder = new ConfigurationBuilder();

var services = new ServiceCollection();

var environment = new HostingEnvironment()
{
    EnvironmentName = "Production"
};

ConfigurationFactory.Configure(
    configurationBuilder, 
    args,
    "sponsorkit-secrets");

var registry = new IocRegistry(
    services,
    configurationBuilder.Build(),
    environment,
    new [] {
        typeof(IocRegistry).Assembly
    });
registry.Register();

await using var serviceProvider = services.BuildServiceProvider();
try
{
    var payoutHostedService = serviceProvider.GetRequiredService<PayoutHostedService>();
    await payoutHostedService.StartAsync(default);
    
    return 0;
}
catch (Exception ex) when (!Debugger.IsAttached)
{
    Log.Fatal(ex, "Host terminated unexpectedly");
    return 1;
}
finally
{
    Log.CloseAndFlush();
}