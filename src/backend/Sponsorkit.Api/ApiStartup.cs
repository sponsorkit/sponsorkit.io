using System;
using System.Linq;
using System.Net.Mime;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Serilog;
using Sponsorkit.Api.Infrastructure.AspNet.Health;
using Sponsorkit.BusinessLogic.Infrastructure.Logging;

namespace Sponsorkit.Api;

public static class ApiStartup
{
    public static WebApplicationBuilder CreateWebApplicationBuilder(
        WebApplicationOptions webApplicationOptions)
    {
        var webApplicationBuilder = WebApplication.CreateBuilder(webApplicationOptions);
        webApplicationBuilder.Host.UseSerilog();
        
        return webApplicationBuilder;
    }

    public static void ConfigureWebApplication(WebApplication webApplication)
    {
        Log.Logger = LoggerFactory.BuildWebApplicationLogger();

        webApplication.UseForwardedHeaders();
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