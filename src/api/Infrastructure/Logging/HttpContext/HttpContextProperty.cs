using System;
using System.IO;
using Hangfire.Server;
using Microsoft.AspNetCore.Http;
using Serilog.Events;

namespace Sponsorkit.Infrastructure.Hangfire;

public class HttpContextProperty : LogEventPropertyValue
{
    public HttpContext HttpContext { get; }

    public HttpContextProperty(HttpContext performContext)
    {
        HttpContext = performContext;
    }

    public override void Render(TextWriter output, string? format = null, IFormatProvider? formatProvider = null)
    {
    }
}