using Microsoft.AspNetCore.Http;
using Serilog.Core;
using Serilog.Events;

namespace Sponsorkit.Infrastructure.Hangfire;

public class HttpContextEnricher : ILogEventEnricher
{
    private readonly HttpContext httpContext;

    public HttpContextEnricher(HttpContext httpContext)
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