using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.BusinessLogic.Domain.Helpers;
using Sponsorkit.BusinessLogic.Infrastructure.Stripe;

namespace Sponsorkit.Api.Domain.Controllers.Api.Bounties.Calculate;

public record Request(
    [FromQuery] long AmountInHundreds);

public record Response(
    long FeeAmountInHundreds);

public class CalculateGet : EndpointBaseSync
    .WithRequest<Request>
    .WithActionResult<Response>
{
    [HttpGet("bounties/calculate")]
    [AllowAnonymous]
    public override ActionResult<Response> Handle([FromQuery] Request request)
    {
        if (request.AmountInHundreds < Constants.MinimumBountyAmountInHundreds)
            return BadRequest("Minimum amount is 10 USD.");

        return new Response(
            FeeCalculator.GetSponsorkitFeeInHundreds(request.AmountInHundreds));
    }
}