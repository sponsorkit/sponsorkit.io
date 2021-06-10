using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Api.Bounties.GitHubIssueId
{
    public record PostRequest(
        [FromRoute] long GitHubIssueId,
        [FromQuery] int AmountInHundreds);
    
    public class Post : BaseAsyncEndpoint
        .WithRequest<PostRequest>
        .WithoutResponse
    {
        private readonly DataContext dataContext;

        public Post(
            DataContext dataContext)
        {
            this.dataContext = dataContext;
        }
        
        [HttpPost("/api/bounties/{gitHubIssueId}")]
        public override async Task<ActionResult> HandleAsync(PostRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetRequiredId();

            await dataContext.ExecuteInTransactionAsync(
                async () =>
                {
                    var issue = await dataContext.Issues.SingleAsync(
                        x => x.GitHubId == request.GitHubIssueId,
                        cancellationToken);

                    var user = await dataContext.Users.SingleAsync(
                        x => x.Id == userId,
                        cancellationToken);

                    var bounty = new BountyBuilder()
                        .WithAmountInHundreds(request.AmountInHundreds)
                        .WithCreator(user)
                        .WithIssue(issue)
                        .Build();
                    dataContext.Bounties.Add(bounty);
                    await dataContext.SaveChangesAsync(cancellationToken);

                    //TODO: use payment intents.
                    //TODO: charge first, then transfer later: https://stripe.com/docs/connect/charges-transfers
                    //TODO: use source_transaction instead of transfer destination groups.
                });

            throw new Exception();
        }
    }
}