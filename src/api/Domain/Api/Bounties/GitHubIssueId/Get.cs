using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;

namespace Sponsorkit.Domain.Api.Bounties.GitHubIssueId
{
    public record GetRequest(
        [FromRoute] long GitHubIssueId);

    public record GetResponse(
        BountyResponse[] Bounties);

    public record BountyResponse(
        long AmountInHundreds,
        DateTime CreatedAtUtc,
        BountyUserResponse CreatorUser,
        BountyUserResponse? AwardedUser);

    public record BountyUserResponse(
        long Id,
        string GitHubUsername);
    
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
        
        [HttpGet("/api/bounties/{gitHubIssueId}")]
        [AllowAnonymous]
        public override async Task<ActionResult<GetResponse>> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var issue = await dataContext.Issues
                .Include(x => x.Bounties).ThenInclude(x => x.Creator)
                .Include(x => x.Bounties).ThenInclude(x => x.AwardedTo)
                .SingleOrDefaultAsync(
                    x => x.GitHubId == request.GitHubIssueId,
                    cancellationToken);
            if (issue == null)
                return NotFound();

            return new GetResponse(issue.Bounties
                .Select(x => new BountyResponse(
                    x.AmountInHundreds,
                    x.CreatedAtUtc,
                    new BountyUserResponse(
                        x.Creator.GitHub!.Id,
                        x.Creator.GitHub.Username),
                    x.AwardedTo == null ? null : new BountyUserResponse(
                        x.AwardedTo.GitHub!.Id,
                        x.AwardedTo.GitHub.Username)))
                .ToArray());
        }
    }
}