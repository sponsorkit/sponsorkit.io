using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models.Context;

namespace Sponsorkit.Domain.Controllers.Api.Bounties
{
    public record Response(
        BountyResponse[] Bounties);

    public record BountyResponse(
        long AmountInHundreds,
        long GitHubIssueId,
        int BountyCount);
    
    public class Get : BaseAsyncEndpoint
        .WithoutRequest
        .WithResponse<Response>
    {
        private readonly DataContext dataContext;

        public Get(
            DataContext dataContext)
        {
            this.dataContext = dataContext;
        }
        
        [HttpGet("/bounties")]
        [AllowAnonymous]
        public override async Task<ActionResult<Response>> HandleAsync(CancellationToken cancellationToken = new CancellationToken())
        {
            var groupedResponse = await dataContext.Bounties
                .AsQueryable()
                .GroupBy(x => x.Issue)
                .Select(x => new BountyResponse(
                    x.Sum(b => b.AmountInHundreds),
                    x.Key.GitHub.Id,
                    x.Count()))
                .OrderByDescending(x => x.AmountInHundreds)
                .ToArrayAsync(cancellationToken);
            return new Response(groupedResponse);
        }
    }
}