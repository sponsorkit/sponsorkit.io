using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Sponsorkit.Infrastructure.Options;

namespace Sponsorkit.Domain.Api.Configuration
{
    public record Response(
        string StripeClientId);
    
    public class Get : BaseEndpoint
        .WithoutRequest
        .WithResponse<Response>
    {
        private readonly IOptionsMonitor<StripeOptions> stripeOptions;

        public Get(
            IOptionsMonitor<StripeOptions> stripeOptions)
        {
            this.stripeOptions = stripeOptions;
        }
        
        [HttpGet("/api/configuration")]
        [AllowAnonymous]
        public override ActionResult<Response> Handle()
        {
            return new Response(
                stripeOptions.CurrentValue.PublishableKey);
        }
    }
}