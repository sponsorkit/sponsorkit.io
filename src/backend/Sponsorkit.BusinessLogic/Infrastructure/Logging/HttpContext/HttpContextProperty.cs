using Serilog.Events;

namespace Sponsorkit.BusinessLogic.Infrastructure.Logging.HttpContext;

public class HttpContextProperty : LogEventPropertyValue
{
    public Microsoft.AspNetCore.Http.HttpContext HttpContext { get; }

    public HttpContextProperty(Microsoft.AspNetCore.Http.HttpContext performContext)
    {
        HttpContext = performContext;
    }

    public override void Render(TextWriter output, string? format = null, IFormatProvider? formatProvider = null)
    {
    }
}