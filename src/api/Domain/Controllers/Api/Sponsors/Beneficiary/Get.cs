using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models.Context;

namespace Sponsorkit.Domain.Controllers.Api.Sponsors.Beneficiary;

public record Response(
    Guid Id)
{
    public long? GitHubId { get; set; }
}

public record Request(
    [FromRoute] Guid BeneficiaryId);
    
public class Get : EndpointBaseAsync
    .WithRequest<Request>
    .WithActionResult<Response>
{
    private readonly DataContext dataContext;

    public Get(
        DataContext dataContext)
    {
        this.dataContext = dataContext;
    }

    [HttpGet("sponsors/{beneficiaryId}")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override async Task<ActionResult<Response>> HandleAsync(Request request, CancellationToken cancellationToken = new())
    {
        var user = await dataContext.Users.SingleOrDefaultAsync(
            x => x.Id == request.BeneficiaryId, 
            cancellationToken: cancellationToken);
        if (user == null)
            return NotFound();

        return new OkObjectResult(new Response(user.Id)
        {
            GitHubId = user.GitHub?.Id
        });
    }
}