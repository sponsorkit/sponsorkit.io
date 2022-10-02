using System;
using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Http;
using Serilog.Context;
using Serilog.Core;
using Serilog.Events;

namespace Sponsorkit.Infrastructure.Logging;

public class ResponseBodySink : ILogEventSink
{
    private readonly IHttpContextAccessor httpContextAccessor;
    
    private const string ResponseBodyPropertyName = "ShouldLogToResponseSink";

    public ResponseBodySink(
        IHttpContextAccessor httpContextAccessor)
    {
        this.httpContextAccessor = httpContextAccessor;
    }
    
    public static IDisposable EnableResponseBodyLogging()
    {
        return LogContext.PushProperty(ResponseBodyPropertyName, true);
    }

    public void Emit(LogEvent logEvent)
    {
        if (!logEvent.Properties.ContainsKey(ResponseBodyPropertyName))
            return;

        if (httpContextAccessor.HttpContext == null)
            return;

        var text = logEvent.RenderMessage(CultureInfo.InvariantCulture);
        var bytes = Encoding.UTF8.GetBytes(text);
        httpContextAccessor.HttpContext.Response.Body.Write(bytes);
    }
}