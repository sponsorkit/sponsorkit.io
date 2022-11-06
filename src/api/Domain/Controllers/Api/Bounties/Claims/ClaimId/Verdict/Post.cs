using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Database;
using Sponsorkit.Domain.Models.Database.Context;
using Sponsorkit.Infrastructure.AspNet;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.Claims.ClaimId.Verdict;

public record PostRequest(
    [FromRoute] Guid ClaimId,
    ClaimVerdict Verdict);
    
public class Post : EndpointBaseAsync
    .WithRequest<PostRequest>
    .WithoutResult
{
    private readonly DataContext dataContext;

    public Post(DataContext dataContext)
    {
        this.dataContext = dataContext;
    }
        
    [HttpPost("bounties/claims/{claimId}/verdict")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override async Task<ActionResult> HandleAsync(PostRequest request, CancellationToken cancellationToken = new CancellationToken())
    {
        var userId = User.GetRequiredId();
            
        var claimRequest = await dataContext.BountyClaimRequests
            .SingleOrDefaultAsync(
                x => 
                    x.Id == request.ClaimId &&
                    x.Bounty.CreatorId == userId,
                cancellationToken);
        if (claimRequest == null)
            return NotFound();

        claimRequest.Verdict = request.Verdict;
        claimRequest.VerdictAt = DateTimeOffset.UtcNow;
        await dataContext.SaveChangesAsync(cancellationToken);

        return Ok();
    }
}