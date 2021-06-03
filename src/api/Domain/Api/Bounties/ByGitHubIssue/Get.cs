using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;

namespace Sponsorkit.Domain.Api.Bounties.ByGitHubIssue
{
    public record Request(
        long IssueId);

    public record Response(
        BountyResponse[] Bounties);

    public record BountyResponse(
        int AmountInHundreds,
        BountyUserResponse CreatorUser,
        BountyUserResponse? AwardedUser);

    public record BountyUserResponse(
        long Id,
        string GitHubUsername);
    
    public class Get : BaseAsyncEndpoint
        .WithRequest<Request>
        .WithResponse<Response>
    {
        private readonly DataContext dataContext;

        public Get(
            DataContext dataContext)
        {
            this.dataContext = dataContext;
        }
        
        [HttpPost("/api/bounties/by-github-issue")]
        public override async Task<ActionResult<Response>> HandleAsync(Request request, CancellationToken cancellationToken = new CancellationToken())
        {
            var issue = await dataContext.Issues
                .Include(x => x.Bounties).ThenInclude(x => x.Creator)
                .Include(x => x.Bounties).ThenInclude(x => x.AwardedTo)
                .SingleOrDefaultAsync(
                    x => x.GitHubId == request.IssueId,
                    cancellationToken);
            if (issue == null)
                return NotFound();

            return new Response(issue.Bounties
                .Select(x => new BountyResponse(
                    x.AmountInHundreds,
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