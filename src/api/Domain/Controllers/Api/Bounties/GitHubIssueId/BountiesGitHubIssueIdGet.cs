using System;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models.Database.Context;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.GitHubIssueId;

public record GetRequest(
    [FromRoute] long GitHubIssueId);

public record GetResponse(
    BountyResponse[] Bounties);

public record BountyClaimRequestResponse(
    Guid CreatorId);

public record BountyResponse(
    long AmountInHundreds,
    DateTimeOffset CreatedAt,
    BountyUserResponse CreatorUser,
    BountyUserResponse? AwardedUser,
    BountyClaimRequestResponse[] ClaimRequests);

public record BountyUserResponse(
    long Id,
    string GitHubUsername);
    
public class BountiesGitHubIssueIdGet : EndpointBaseAsync
    .WithRequest<GetRequest>
    .WithActionResult<GetResponse>
{
    private readonly DataContext dataContext;

    public BountiesGitHubIssueIdGet(
        DataContext dataContext)
    {
        this.dataContext = dataContext;
    }
        
    [HttpGet("bounties/{gitHubIssueId}")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [SuppressMessage("ReSharper", "NullableWarningSuppressionIsUsed")]
    public override async Task<ActionResult<GetResponse>> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = new CancellationToken())
    {
        var issue = await dataContext.Issues
            .Include(x => x.Bounties).ThenInclude(x => x.Payments)
            .Include(x => x.Bounties).ThenInclude(x => x.Creator)
            .Include(x => x.Bounties).ThenInclude(x => x.AwardedTo)
            .Include(x => x.Bounties).ThenInclude(x => x.ClaimRequests)
            .SingleOrDefaultAsync(
                x => x.GitHub.Id == request.GitHubIssueId,
                cancellationToken);
        if (issue == null)
            return NotFound();

        return new GetResponse(issue.Bounties
            .Select(x => new BountyResponse(
                x.Payments.Sum(p => p.AmountInHundreds),
                x.CreatedAt,
                new BountyUserResponse(
                    x.Creator.GitHub!.Id,
                    x.Creator.GitHub.Username),
                x.AwardedTo == null ? null : new BountyUserResponse(
                    x.AwardedTo.GitHub!.Id,
                    x.AwardedTo.GitHub.Username),
                x.ClaimRequests
                    .Select(c => new BountyClaimRequestResponse(
                        c.CreatorId))
                    .ToArray()))
            .ToArray());
    }
}