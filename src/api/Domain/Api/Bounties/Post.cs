using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Ardalis.Result;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Api.Bounties
{
    public record PostGitHubIssueRequest(
        string OwnerName,
        string RepositoryName,
        int IssueNumber);
    
    public record PostRequest(
        PostGitHubIssueRequest Issue,
        int AmountInHundreds);
    
    public class Post : BaseAsyncEndpoint
        .WithRequest<PostRequest>
        .WithoutResponse
    {
        private readonly DataContext dataContext;
        private readonly IMediator mediator;
        private readonly PaymentIntentService paymentIntentService;

        public Post(
            DataContext dataContext,
            IMediator mediator,
            PaymentIntentService paymentIntentService)
        {
            this.dataContext = dataContext;
            this.mediator = mediator;
            this.paymentIntentService = paymentIntentService;
        }
        
        [HttpPost("/api/bounties")]
        public override async Task<ActionResult> HandleAsync([FromBody] PostRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetRequiredId();
            
            var issue = await mediator.Send(
                new EnsureGitHubIssueInDatabaseCommand(
                    request.Issue.OwnerName,
                    request.Issue.RepositoryName,
                    request.Issue.IssueNumber),
                cancellationToken);
            if (issue.Status == ResultStatus.NotFound)
                return NotFound();

            await dataContext.ExecuteInTransactionAsync(
                async () =>
                {
                    var user = await dataContext.Users.SingleAsync(
                        x => x.Id == userId,
                        cancellationToken);

                    var paymentMethod = await mediator.Send(
                        new GetPaymentMethodForCustomerQuery(user.StripeCustomerId),
                        cancellationToken);
                    if (paymentMethod == null)
                        return BadRequest("No payment method attached for given user.");

                    var bounty = new BountyBuilder()
                        .WithAmountInHundreds(request.AmountInHundreds)
                        .WithCreator(user)
                        .WithIssue(issue)
                        .Build();
                    await dataContext.Bounties.AddAsync(
                        bounty,
                        cancellationToken);

                    var payment = new PaymentBuilder()
                        .WithBounty(bounty)
                        .WithAmountInHundreds(request.AmountInHundreds)
                        .WithStripeId(string.Empty);
                    await dataContext.Payments.AddAsync(
                        payment,
                        cancellationToken);

                    await dataContext.SaveChangesAsync(cancellationToken);

                    var feeInHundreds = FeeCalculator.GetSponsorkitFeeInHundreds(request.AmountInHundreds);
                    var amountToChargeInHundreds = request.AmountInHundreds + feeInHundreds;

                    var paymentIntent = await paymentIntentService.CreateAsync(
                        new ()
                        {
                            Amount = amountToChargeInHundreds,
                            Customer = user.StripeCustomerId,
                            TransferGroup = $"bounty-{issue.Value.Id}"
                        },
                        cancellationToken: default);
                    throw new InvalidOperationException();

                    //TODO: use payment intents.
                    //TODO: charge first, then transfer later: https://stripe.com/docs/connect/charges-transfers
                    //TODO: use source_transaction instead of transfer destination groups.
                });

            throw new Exception();
        }
    }
}