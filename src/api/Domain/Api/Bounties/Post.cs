using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;
using BountiesIntentPost = Sponsorkit.Domain.Api.Bounties.Intent.Post;

namespace Sponsorkit.Domain.Api.Bounties
{
    public record PostRequest(
        [FromBody] string PaymentIntentId);
    
    public class Post : BaseAsyncEndpoint
        .WithRequest<PostRequest>
        .WithoutResponse
    {
        private readonly DataContext dataContext;
        private readonly PaymentIntentService paymentIntentService;

        public Post(
            DataContext dataContext,
            PaymentIntentService paymentIntentService)
        {
            this.dataContext = dataContext;
            this.paymentIntentService = paymentIntentService;
        }
        
        [HttpPost("/api/bounties")]
        public override async Task<ActionResult> HandleAsync(PostRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetRequiredId();

            var paymentIntent = await paymentIntentService.GetAsync(
                request.PaymentIntentId,
                cancellationToken: cancellationToken);
            if (paymentIntent == null)
                return new NotFoundResult();

            var gitHubIssueIdString = paymentIntent.Metadata[BountiesIntentPost.GitHubIssueIdStripeMetadataKey];
            if (!long.TryParse(gitHubIssueIdString, out var gitHubIssueId))
                throw new InvalidOperationException("No GitHub issue ID associated with Stripe payment intent.");

            var bountyAmountString = paymentIntent.Metadata[BountiesIntentPost.BountyAmountStripeMetadataKey];
            if (!long.TryParse(bountyAmountString, out var bountyAmountInHundreds))
                throw new InvalidOperationException("No bounty amount associated with Stripe payment intent.");
            
            await dataContext.ExecuteInTransactionAsync(
                async () =>
                {
                    var issue = await dataContext.Issues.SingleAsync(
                        x => x.GitHubId == gitHubIssueId,
                        cancellationToken);

                    var user = await dataContext.Users.SingleAsync(
                        x => x.Id == userId,
                        cancellationToken);

                    var bounty = new BountyBuilder()
                        .WithAmountInHundreds(bountyAmountInHundreds)
                        .WithCreator(user)
                        .WithIssue(issue)
                        .Build();
                    dataContext.Bounties.Add(bounty);
                    await dataContext.SaveChangesAsync(cancellationToken);

                    await paymentIntentService.CaptureAsync(
                        paymentIntent.Id, 
                        cancellationToken: cancellationToken);
                    
                    //TODO: use payment intents.
                    //TODO: charge first, then transfer later: https://stripe.com/docs/connect/charges-transfers
                    //TODO: use source_transaction instead of transfer destination groups.
                });

            throw new Exception();
        }
    }
}