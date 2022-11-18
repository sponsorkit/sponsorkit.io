using System;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Builder;
using Serilog;
using Sponsorkit;
using Sponsorkit.Infrastructure;

[assembly: InternalsVisibleTo("Sponsorkit.Tests")]

var builder = Startup.CreateWebApplicationBuilder(new WebApplicationOptions()
{
    Args = args
});

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