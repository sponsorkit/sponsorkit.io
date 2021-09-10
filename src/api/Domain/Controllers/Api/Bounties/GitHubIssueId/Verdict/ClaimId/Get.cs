using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.GitHubIssueId.Verdict.ClaimId
{
    public record GetRequest(
        [FromRoute] Guid ClaimId);

    public record GetResponse(
        long BountyAmountInHundreds,
        long GitHubPullRequestId,
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
        
        [HttpGet("/bounties/{gitHubIssueId}/verdict/{claimId}")]
        public override async Task<ActionResult<GetResponse>> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var claimRequest = await dataContext.BountyClaimRequests.SingleOrDefaultAsync(
                x => x.Id == request.ClaimId,
                cancellationToken);
            if (claimRequest == null)
                return NotFound();

            return new GetResponse(
                claimRequest.Bounty.AmountInHundreds,
                claimRequest.GitHubPullRequestId,
                claimRequest.Verdict);
        }
    }
}