using System;
using System.Diagnostics;
using System.Linq;
using System.Net.Mime;
using System.Runtime.CompilerServices;
using System.Text.Json;
using FluffySpoon.AspNet.NGrok;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Serilog;
using Sponsorkit;
using Sponsorkit.Infrastructure;
using Sponsorkit.Infrastructure.AspNet.Health;
using Sponsorkit.Infrastructure.Ioc;
using Sponsorkit.Infrastructure.Logging;

[assembly: InternalsVisibleTo("Sponsorkit.Tests")]

var builder = Startup.CreateWebApplicationBuilder(new WebApplicationOptions()
{
    Args = args
});
builder.WebHost.UseNGrok(new NgrokOptions()
{
    Disable = !Debugger.IsAttached,
    ShowNGrokWindow = false,
    ApplicationHttpUrl = "http://localhost:5000"
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