using System;
using System.IO;
using Hangfire.Server;
using Serilog.Events;

namespace Sponsorkit.Infrastructure.Hangfire;

public class PerformContextProperty : LogEventPropertyValue
{
    public PerformContext? PerformContext { get; }

    public PerformContextProperty(PerformContext? performContext)
    {
        PerformContext = performContext;
    }

    public override void Render(TextWriter output, string? format = null, IFormatProvider? formatProvider = null)
    {
    }
}