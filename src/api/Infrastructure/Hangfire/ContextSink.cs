using System;
using Hangfire.Console;
using Serilog.Core;
using Serilog.Events;

namespace Sponsorkit.Infrastructure.Hangfire;

public class ContextSink : ILogEventSink
{
    public const string PerformContextProperty = "PerformContext";

    public void Emit(LogEvent logEvent)
    {
        if (!logEvent.Properties.TryGetValue(PerformContextProperty, out var propertyValue)) 
            return;

        var context = (propertyValue as PerformContextProperty)?.PerformContext;

        var color = logEvent.Level switch
        {
            LogEventLevel.Information => ConsoleTextColor.White,
            LogEventLevel.Warning => ConsoleTextColor.Yellow,
            LogEventLevel.Error => ConsoleTextColor.Red,
            LogEventLevel.Fatal => ConsoleTextColor.Red,
            _ => ConsoleTextColor.Gray
        };

        var message = logEvent.RenderMessage();
        context?.WriteLine(color, DateTime.UtcNow + " " + message);
    }
}