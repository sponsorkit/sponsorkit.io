using System;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Controllers.Api.Bounties.Intent;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Domain.Models.Context;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers
{
    /// <summary>
    /// Posts a bounty to the database once the 
    /// </summary>
    public class PaymentIntentSucceededEventHandler : WebhookEventHandler<PaymentIntent>
    {
        private readonly DataContext dataContext;
        private readonly IMediator mediator;
        private readonly PaymentIntentService paymentIntentService;

        public PaymentIntentSucceededEventHandler(
            DataContext dataContext,
            IMediator mediator,
            PaymentIntentService paymentIntentService)
        {
            this.dataContext = dataContext;
            this.mediator = mediator;
            this.paymentIntentService = paymentIntentService;
        }

        protected override async Task HandleAsync(PaymentIntent data, CancellationToken cancellationToken)
        {
            var type = data.Metadata[UniversalMetadataKeys.Type];
            if (type != "BountyPaymentIntent")
                throw new InvalidOperationException($"Invalid payment intent type: {type}");

            var amountInHundreds = int.Parse(data.Metadata[MetadataKeys.AmountInHundreds], CultureInfo.InvariantCulture);
            var gitHubIssueNumber = int.Parse(data.Metadata[MetadataKeys.GitHubIssueNumber], CultureInfo.InvariantCulture);
            var gitHubOwnerName = data.Metadata[MetadataKeys.GitHubIssueOwnerName];
            var gitHubRepositoryName = data.Metadata[MetadataKeys.GitHubIssueRepositoryName];
            var userId = Guid.Parse(data.Metadata[MetadataKeys.UserId]);

            await dataContext.ExecuteInTransactionAsync(
                async () =>
                {
                    var issue = await mediator.Send(
                        new EnsureGitHubIssueInDatabaseCommand(
                            gitHubOwnerName,
                            gitHubRepositoryName,
                            gitHubIssueNumber),
                        cancellationToken);
                    
                    var user = await dataContext.Users.SingleAsync(
                        x => x.Id == userId,
                        cancellationToken);

                    var bounty = new BountyBuilder()
                        .WithAmountInHundreds(amountInHundreds)
                        .WithCreator(user)
                        .WithIssue(issue)
                        .Build();
                    await dataContext.Bounties.AddAsync(
                        bounty,
                        cancellationToken);

                    var payment = new PaymentBuilder()
                        .WithBounty(bounty)
                        .WithAmountInHundreds(amountInHundreds)
                        .WithStripeId(data.Id)
                        .Build();
                    await dataContext.Payments.AddAsync(
                        payment,
                        cancellationToken);

                    await dataContext.SaveChangesAsync(cancellationToken);
                });
        }

        public override bool CanHandle(string type)
        {
            return type == Events.PaymentIntentSucceeded;
        }
    }
}