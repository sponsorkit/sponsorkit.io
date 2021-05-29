using System;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;

namespace Sponsorkit.Domain.Api.Browser.BeneficiaryIdReference
{
    public record Request(
        [FromRoute] Guid BeneficiaryId,
        [FromRoute] string Reference);
    
    public class Get : BaseEndpoint
        .WithRequest<Request>
        .WithoutResponse
    {
        [HttpGet("/api/browser/{beneficiaryId}/{reference}")]
        public override ActionResult Handle(Request request)
        {
            return new RedirectResult(
                $"/{request.BeneficiaryId}?reference={request.Reference}",
                true,
                false);
        }
    }
}