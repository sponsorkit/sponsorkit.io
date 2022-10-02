using System.Globalization;
using System.Text;
using Serilog.Core;
using Serilog.Events;

namespace Sponsorkit.Infrastructure.Logging.HttpContext;

public class HttpContextSink : ILogEventSink
{
    public const string HttpContextProperty = "HttpContext";

    public void Emit(LogEvent logEvent)
    {
        if (!logEvent.Properties.TryGetValue(HttpContextProperty, out var propertyValue)) 
            return;

        var context = (propertyValue as HttpContextProperty)?.HttpContext;
        if (context == null)
            return;

        var text = logEvent.RenderMessage(CultureInfo.InvariantCulture);
        var bytes = Encoding.UTF8.GetBytes(text);
        context.Response.Body.Write(bytes);
    }
}