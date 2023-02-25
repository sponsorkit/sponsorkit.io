using Microsoft.AspNetCore.Http;

namespace Sponsorkit.BusinessLogic.Infrastructure.AspNet;

public static class HttpRequestExtensions
{
    public static Guid GetIdempotencyKey(this HttpRequest request)
    {
        var stringValue = request.Headers["Idempotency-Key"].SingleOrDefault();
        return Guid.TryParse(stringValue, out var guid) ?
            guid : 
            Guid.Empty;
    }
}