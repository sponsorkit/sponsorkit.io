using System;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Builder;
using Serilog;
using Sponsorkit.Api;
using Sponsorkit.Api.Infrastructure.Ioc;
using Sponsorkit.BusinessLogic.Infrastructure;
using Sponsorkit.BusinessLogic.Infrastructure.Ioc;

[assembly: InternalsVisibleTo("Sponsorkit.Tests")]

var builder = Startup.CreateWebApplicationBuilder(
    new WebApplicationOptions()
    {
        Args = args
    });

ConfigurationFactory.Configure(
    builder.Configuration, 
    args,
    "sponsorkit-secrets");

var registry = new ApiIocRegistry(
    builder.Services,
    builder.Configuration,
    builder.Environment,
    new [] {
        typeof(BusinessLogicIocRegistry).Assembly,
        typeof(ApiIocRegistry).Assembly
    });
registry.Register();

var app = builder.Build();
Startup.ConfigureWebApplication(app);

try
{
    await DatabaseMigrator.MigrateDatabaseForHostAsync(app);

    await app.RunAsync();

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