using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;

namespace Sponsorkit.Domain
{
    public class HealthCheckEndpoint : BaseEndpoint
        .WithoutRequest
        .WithoutResponse
    {
        [HttpGet("/health")]
        public override ActionResult Handle()
        {
            return new OkResult();
        }
    }
}
