using System;
using System.Diagnostics.CodeAnalysis;
using Destructurama;
using Microsoft.Extensions.Configuration;
using Serilog;
using Serilog.Debugging;
using Serilog.Events;
using Serilog.Filters;
using Sponsorkit.Infrastructure.Logging.HttpContext;

namespace Sponsorkit.Infrastructure.Logging;

[ExcludeFromCodeCoverage]
public static class LoggerFactory
{
    private static LoggerConfiguration CreateBaseLoggingConfiguration()
    {
        return new LoggerConfiguration()
            .Destructure.UsingAttributes()
            .MinimumLevel.Verbose()
            .MinimumLevel.Override("Microsoft", LogEventLevel.Information)
            .MinimumLevel.Override("Microsoft.Extensions.Http", LogEventLevel.Information)
            .Filter.ByExcluding(Matching.FromSource("Microsoft.EntityFrameworkCore"));
    }

    public static ILogger BuildWebApplicationLogger(IConfiguration configuration)
    {
        return BuildWebApplicationLogConfiguration(configuration)
            .CreateLogger();
    }

    public static LoggerConfiguration BuildWebApplicationLogConfiguration(IConfiguration configuration)
    {
        SelfLog.Enable(Console.Error);

        var loggerConfiguration = CreateBaseLoggingConfiguration()
            .Enrich.FromLogContext()
            .Filter.ByExcluding(Matching.FromSource("Elastic.Apm"))
            .WriteTo.Console()
            .WriteTo.Sink<HttpContextSink>();

        return loggerConfiguration;
    }
}