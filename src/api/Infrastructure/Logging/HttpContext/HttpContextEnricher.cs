using Serilog.Core;
using Serilog.Events;

namespace Sponsorkit.Infrastructure.Logging.HttpContext;

public class HttpContextEnricher : ILogEventEnricher
{
    private readonly Microsoft.AspNetCore.Http.HttpContext httpContext;

    public HttpContextEnricher(Microsoft.AspNetCore.Http.HttpContext httpContext)
    {
        this.httpContext = httpContext;
    }

    public void Enrich(LogEvent logEvent, ILogEventPropertyFactory propertyFactory)
    {
        logEvent.AddPropertyIfAbsent(new LogEventProperty(
            HttpContextSink.HttpContextProperty, 
            new HttpContextProperty(httpContext)));
    }
}