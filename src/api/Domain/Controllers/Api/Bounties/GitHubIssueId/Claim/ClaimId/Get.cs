using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Helpers;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.GitHubIssueId.Claim.ClaimId
{
    public record GetRequest(
        [FromRoute] Guid ClaimId);
    
    public class Get : BaseAsyncEndpoint
        .WithRequest<GetRequest>
        .WithoutResponse
    {
        [HttpGet("/bounties/{gitHubIssueId}/claim/{claimId}")]
        public override Task<ActionResult> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var link = LinkHelper.GetWebUrl($"/bounties/verdict/{request.ClaimId}");
            return Task.FromResult<ActionResult>(new RedirectResult(link));
        }
    }
}