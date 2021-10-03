using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Models.Context;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.Calculate
{
    public record Request(
        [FromQuery] long AmountInHundreds);
    
    public record Response(
        long FeeAmountInHundreds);
    
    public class Get : BaseEndpoint
        .WithRequest<Request>
        .WithResponse<Response>
    {
        [HttpGet("/bounties/calculate")]
        [AllowAnonymous]
        public override ActionResult<Response> Handle([FromQuery] Request request)
        {
            return new Response(
                FeeCalculator.GetSponsorkitFeeInHundreds(request.AmountInHundreds));
        }
    }
}