using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.Claims.ClaimId.Verdict;

public record GetRequest(
    [FromRoute] Guid ClaimId);

public record GitHubResponse(
    string OwnerName,
    string RepositoryName,
    long PullRequestNumber,
    long IssueNumber);

public record GetResponse(
    long BountyAmountInHundreds,
    GitHubResponse GitHub,
    ClaimVerdict? CurrentClaimVerdict);
    
public class Get : EndpointBaseAsync
    .WithRequest<GetRequest>
    .WithActionResult<GetResponse>
{
    private readonly DataContext dataContext;

    public Get(
        DataContext dataContext)
    {
        this.dataContext = dataContext;
    }
        
    [HttpGet("/bounties/claims/{claimId}/verdict")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override async Task<ActionResult<GetResponse>> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = new CancellationToken())
    {
        var userId = User.GetRequiredId();
            
        var claimRequest = await dataContext.BountyClaimRequests
            .Include(x => x.Bounty).ThenInclude(x => x.Payments)
            .Include(x => x.Bounty).ThenInclude(x => x.Issue).ThenInclude(x => x.Repository)
            .Include(x => x.PullRequest)
            .SingleOrDefaultAsync(
                x => 
                    x.Id == request.ClaimId &&
                    x.Bounty.CreatorId == userId,
                cancellationToken);
        if (claimRequest == null)
            return NotFound();

        var issueRepository = claimRequest.Bounty.Issue.Repository;
        if (issueRepository == null)
            throw new InvalidOperationException("The given issue does not have a repository attached.");

        return new GetResponse(
            claimRequest.Bounty.Payments.Sum(x => x.AmountInHundreds),
            new GitHubResponse(
                issueRepository.GitHub.OwnerName,
                issueRepository.GitHub.Name,
                claimRequest.PullRequest.GitHub.Number,
                claimRequest.Bounty.Issue.GitHub.Number),
            claimRequest.Verdict);
    }
}