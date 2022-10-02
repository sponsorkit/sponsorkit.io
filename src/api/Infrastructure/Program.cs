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
using Sponsorkit.Infrastructure;
using Sponsorkit.Infrastructure.AspNet.Health;
using Sponsorkit.Infrastructure.Ioc;
using Sponsorkit.Infrastructure.Logging;

[assembly: InternalsVisibleTo("Sponsorkit.Tests")]

var builder = WebApplication.CreateBuilder(args);
ConfigurationFactory.Configure(builder.Configuration, args, "sponsorkit-secrets");

builder.Host.UseSerilog();
builder.WebHost.UseNGrok(new NgrokOptions()
{
    Disable = !Debugger.IsAttached,
    ShowNGrokWindow = false,
    ApplicationHttpUrl = "http://localhost:5000"
});

var registry = new IocRegistry(
    builder.Services,
    builder.Configuration,
    builder.Environment);
registry.Register();

var app = builder.Build();
Log.Logger = LoggerFactory.BuildWebApplicationLogger(app.Configuration);

app.UseForwardedHeaders();
app.UseNGrokAutomaticUrlDetection();
app.UseResponseCompression();
app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseSwagger();
app.UseSwaggerUI();
app.UseWhen(
    IsWebhookRequest,
    webhookApp => webhookApp.Use(async (context, next) =>
    {
        context.Request.EnableBuffering();

        await next();
    }));

app.UseEndpoints(endpoints =>
{
    endpoints.MapHealthChecks("health-json", new HealthCheckOptions()
    {
        ResponseWriter = async (context, report) =>
        {
            var result = JsonSerializer.Serialize(new HealthResult
            {
                Status = report.Status.ToString(),
                Duration = report.TotalDuration,
                Information = report.Entries
                    .Select(e => new HealthInformation
                    {
                        Key = e.Key,
                        Description = e.Value.Description,
                        Duration = e.Value.Duration,
                        Status = Enum.GetName(typeof(HealthStatus),
                            e.Value.Status),
                        Error = e.Value.Exception?.Message
                    })
                    .ToList()
            });

            context.Response.ContentType = MediaTypeNames.Application.Json;

            await context.Response.WriteAsync(result);
        }
    });

    endpoints.MapHealthChecks("health");

    endpoints.MapSwagger();

    endpoints
        .MapControllers()
        .RequireAuthorization();
});

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

static bool IsWebhookRequest(HttpContext context)
{
    return context.Request.Path.StartsWithSegments(
        "/webhooks",
        StringComparison.InvariantCultureIgnoreCase);
}