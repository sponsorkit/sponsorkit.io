using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Sponsorkit.Infrastructure;

namespace Sponsorkit.Domain.Api.Browser.BeneficiaryReference
{
    public record Request(
        [FromRoute] string Beneficiary,
        [FromRoute] string Reference);
    
    public class Get : BaseEndpoint
        .WithRequest<Request>
        .WithoutResponse
    {
        [HttpGet("/api/browser/{beneficiary}/{reference}")]
        public override ActionResult Handle(Request request)
        {
            return new RedirectResult(
                $"/{request.Beneficiary}?reference={request.Reference}",
                true,
                false);
        }
    }
}
