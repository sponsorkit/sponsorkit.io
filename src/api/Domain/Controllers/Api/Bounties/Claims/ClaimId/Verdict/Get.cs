using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.Claims.ClaimId.Verdict
{
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
    
    public class Get : BaseAsyncEndpoint
        .WithRequest<GetRequest>
        .WithResponse<GetResponse>
    {
        private readonly DataContext dataContext;

        public Get(
            DataContext dataContext)
        {
            this.dataContext = dataContext;
        }
        
        [HttpGet("/bounties/claims/{claimId}/verdict")]
        public override async Task<ActionResult<GetResponse>> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var claimRequest = await dataContext.BountyClaimRequests
                .Include(x => x.Bounty).ThenInclude(x => x.Issue).ThenInclude(x => x.Repository)
                .Include(x => x.PullRequest)
                .SingleOrDefaultAsync(
                    x => x.Id == request.ClaimId,
                    cancellationToken);
            if (claimRequest == null)
                return NotFound();

            var issueRepository = claimRequest.Bounty.Issue.Repository;
            if (issueRepository == null)
                throw new InvalidOperationException("The given issue does not have a repository attached.");

            return new GetResponse(
                claimRequest.Bounty.AmountInHundreds,
                new GitHubResponse(
                    issueRepository.GitHub.OwnerName,
                    issueRepository.GitHub.Name,
                    claimRequest.PullRequest.GitHub.Number,
                    claimRequest.Bounty.Issue.GitHub.Number),
                claimRequest.Verdict);
        }
    }
}