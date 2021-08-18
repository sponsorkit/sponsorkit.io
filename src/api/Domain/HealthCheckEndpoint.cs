using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Sponsorkit.Domain
{
    public class HealthCheckEndpoint : BaseEndpoint
        .WithoutRequest
        .WithoutResponse
    {
        [AllowAnonymous]
        [HttpGet("/health")]
        public override ActionResult Handle()
        {
            return new OkResult();
        }
    }
}
