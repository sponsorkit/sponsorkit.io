using System;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Post;

public record Request(
    [FromRoute] Guid BeneficiaryId,
    [FromRoute] string Reference)
{
    public int? AmountInHundreds { get; set; }
    public string? Email { get; set; }
    public string? StripeCardId { get; set; }
}
    
public class Post : EndpointBaseSync
    .WithRequest<Request>
    .WithoutResult
{
    [HttpPost("sponsors/{beneficiaryId}/{reference}")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override void Handle(Request request)
    {
        throw new NotImplementedException();
    }
}