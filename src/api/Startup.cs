using System;
using System.Diagnostics;
using System.Linq;
using System.Net.Mime;
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

namespace Sponsorkit;

public static class Startup
{
    public static WebApplicationBuilder CreateWebApplicationBuilder(
        WebApplicationOptions webApplicationOptions)
    {
        var webApplicationBuilder = WebApplication.CreateBuilder(webApplicationOptions);
        ConfigurationFactory.Configure(
            webApplicationBuilder.Configuration, 
            webApplicationOptions.Args ?? Array.Empty<string>(), 
            "sponsorkit-secrets");

        webApplicationBuilder.Host.UseSerilog();

        var registry = new IocRegistry(
            webApplicationBuilder.Services,
            webApplicationBuilder.Configuration,
            webApplicationBuilder.Environment);
        registry.Register();
        return webApplicationBuilder;
    }

    public static void ConfigureWebApplication(WebApplication webApplication)
    {
        Log.Logger = LoggerFactory.BuildWebApplicationLogger(webApplication.Configuration);

        webApplication.UseForwardedHeaders();
        webApplication.UseNGrokAutomaticUrlDetection();
        webApplication.UseResponseCompression();
        webApplication.UseRouting();
        webApplication.UseCors();
        webApplication.UseAuthentication();
        webApplication.UseAuthorization();
        webApplication.UseSwagger();
        webApplication.UseSwaggerUI();
        webApplication.UseWhen(
            IsWebhookRequest,
            webhookApp => webhookApp.Use(async (context, next) =>
            {
                context.Request.EnableBuffering();

                await next();
            }));

        webApplication.UseEndpoints(endpoints =>
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
        
        static bool IsWebhookRequest(HttpContext context)
        {
            return context.Request.Path.StartsWithSegments(
                "/webhooks",
                StringComparison.InvariantCultureIgnoreCase);
        }
    }
}