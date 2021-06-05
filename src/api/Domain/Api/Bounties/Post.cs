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

namespace Sponsorkit.Domain.Api.Bounties
{
    public record PostRequest(
        [FromQuery] long GitHubIssueId,
        [FromBody] int AmountInHundreds);
    
    public class Post : BaseAsyncEndpoint
        .WithRequest<PostRequest>
        .WithoutResponse
    {
        private readonly DataContext dataContext;
        private readonly ChargeService chargeService;

        public Post(
            DataContext dataContext,
            ChargeService chargeService)
        {
            this.dataContext = dataContext;
            this.chargeService = chargeService;
        }
        
        [HttpPost("/api/bounties")]
        public override async Task<ActionResult> HandleAsync(PostRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetId();
            
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
                    
                });

            throw new Exception();
        }
    }
}