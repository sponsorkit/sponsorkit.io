using System;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.Result;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Npgsql;
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

        public PaymentIntentSucceededEventHandler(
            DataContext dataContext,
            IMediator mediator)
        {
            this.dataContext = dataContext;
            this.mediator = mediator;
        }

        protected override async Task HandleAsync(string eventId, PaymentIntent data, CancellationToken cancellationToken)
        {
            var type = data.Metadata[UniversalMetadataKeys.Type];
            if (type != "BountyPaymentIntent")
                throw new InvalidOperationException($"Invalid payment intent type: {type}");

            var amountInHundreds = int.Parse(data.Metadata[MetadataKeys.AmountInHundreds], CultureInfo.InvariantCulture);
            var gitHubIssueNumber = int.Parse(data.Metadata[MetadataKeys.GitHubIssueNumber], CultureInfo.InvariantCulture);
            var gitHubOwnerName = data.Metadata[MetadataKeys.GitHubIssueOwnerName];
            var gitHubRepositoryName = data.Metadata[MetadataKeys.GitHubIssueRepositoryName];
            var userId = Guid.Parse(data.Metadata[MetadataKeys.UserId]);

            var issue = await mediator.Send(
                new EnsureGitHubIssueInDatabaseCommand(
                    gitHubOwnerName,
                    gitHubRepositoryName,
                    gitHubIssueNumber),
                cancellationToken);
            
            var user = await dataContext.Users.SingleAsync(
                x => x.Id == userId,
                cancellationToken);

            var bounty = await AddOrIncreaseBountyAsync(
                issue, 
                user, 
                amountInHundreds, 
                cancellationToken);

            await AddPaymentForBountyAsync(
                eventId,
                data, 
                bounty, 
                amountInHundreds, 
                cancellationToken);

            await dataContext.SaveChangesAsync(cancellationToken);
        }

        private async Task AddPaymentForBountyAsync(
            string eventId,
            PaymentIntent paymentIntent, 
            Bounty bounty, 
            int amountInHundreds, 
            CancellationToken cancellationToken)
        {
            var payment = new PaymentBuilder()
                .WithBounty(bounty)
                .WithAmountInHundreds(amountInHundreds)
                .WithStripeId(paymentIntent.Id)
                .WithStripeEventId(eventId)
                .Build();
            await dataContext.Payments.AddAsync(
                payment,
                cancellationToken);

            try
            {
                await dataContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException ex) when (
                ex is { 
                    InnerException: PostgresException { 
                        SqlState: PostgresErrorCodes.UniqueViolation
                    }
                })
            {
                throw new EventAlreadyHandledException();
            }
        }

        private async Task<Bounty> AddOrIncreaseBountyAsync(
            Issue issue, 
            User user, 
            int amountInHundreds,
            CancellationToken cancellationToken)
        {
            var bounty = await GetExistingBountyAsync(
                issue,
                user,
                cancellationToken);
            if (bounty == null)
            {
                bounty = await CreateNewBountyAsync(
                    user,
                    issue,
                    amountInHundreds,
                    cancellationToken);
            }
            else
            {
                bounty.AmountInHundreds += amountInHundreds;
            }

            await dataContext.SaveChangesAsync(cancellationToken);

            return bounty;
        }

        private async Task<Bounty> CreateNewBountyAsync(
            User user, 
            Issue issue, 
            int amountInHundreds, 
            CancellationToken cancellationToken)
        {
            var newBounty = new BountyBuilder()
                .WithAmountInHundreds(amountInHundreds)
                .WithCreator(user)
                .WithIssue(issue)
                .Build();
            await dataContext.Bounties.AddAsync(
                newBounty,
                cancellationToken);

            return newBounty;
        }

        private async Task<Bounty?> GetExistingBountyAsync(Issue issue, User user, CancellationToken cancellationToken)
        {
            return await dataContext.Bounties
                .SingleOrDefaultAsync(
                    bounty =>
                        bounty.IssueId == issue.Id &&
                        bounty.CreatorId == user.Id,
                    cancellationToken);
        }

        public override bool CanHandle(string type)
        {
            return type == Events.PaymentIntentSucceeded;
        }
    }
}