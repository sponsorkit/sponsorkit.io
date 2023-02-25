using System.Diagnostics.CodeAnalysis;
using Destructurama;
using Serilog;
using Serilog.Debugging;
using Serilog.Events;
using Serilog.Filters;
using Sponsorkit.BusinessLogic.Infrastructure.Logging.HttpContext;

namespace Sponsorkit.BusinessLogic.Infrastructure.Logging;

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

    public static ILogger BuildWebApplicationLogger()
    {
        return BuildWebApplicationLogConfiguration()
            .CreateLogger();
    }

    private static LoggerConfiguration BuildWebApplicationLogConfiguration()
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