using System;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Sponsorkit.Domain.Controllers.Api.Bounties.Intent;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Domain.Models.Context;
using System.Linq;
using System.Text;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers
{
    /// <summary>
    /// Posts a bounty to the database once the 
    /// </summary>
    public class SetupIntentSucceededEventHandler : WebhookEventHandler<SetupIntent>
    {
        private readonly DataContext dataContext;
        private readonly IMediator mediator;
        private readonly CustomerService customerService;

        public SetupIntentSucceededEventHandler(
            DataContext dataContext,
            IMediator mediator,
            CustomerService customerService)
        {
            this.dataContext = dataContext;
            this.mediator = mediator;
            this.customerService = customerService;
        }

        protected override async Task HandleAsync(string eventId, SetupIntent data, CancellationToken cancellationToken)
        {
            await SetPaymentMethodAsDefaultAsync(data, cancellationToken);
            
            var type = data.Metadata[UniversalMetadataKeys.Type];
            if (type != UniversalMetadataTypes.BountySetupIntent)
                throw new InvalidOperationException($"Invalid payment intent type: {type}");

            await HandleBountySetupIntentAsync(eventId, data, cancellationToken);
        }

        private async Task SetPaymentMethodAsDefaultAsync(SetupIntent data, CancellationToken cancellationToken)
        {
            await customerService.UpdateAsync(
                data.CustomerId,
                new CustomerUpdateOptions()
                {
                    InvoiceSettings = new CustomerInvoiceSettingsOptions()
                    {
                        DefaultPaymentMethod = data.PaymentMethodId
                    }
                },
                cancellationToken: cancellationToken);
        }

        private async Task HandleBountySetupIntentAsync(string eventId, SetupIntent data, CancellationToken cancellationToken)
        {
            var amountInHundreds = int.Parse(data.Metadata[MetadataKeys.AmountInHundreds], CultureInfo.InvariantCulture);
            var gitHubIssueNumber = int.Parse(data.Metadata[MetadataKeys.GitHubIssueNumber], CultureInfo.InvariantCulture);
            var gitHubOwnerName = data.Metadata[MetadataKeys.GitHubIssueOwnerName];
            var gitHubRepositoryName = data.Metadata[MetadataKeys.GitHubIssueRepositoryName];
            var userId = Guid.Parse(data.Metadata[MetadataKeys.UserId]);
            
            var databaseIssue = await dataContext.ExecuteInTransactionAsync(async () =>
            {
                var issue = await mediator.Send(
                    new EnsureGitHubIssueInDatabaseCommand(
                        gitHubOwnerName,
                        gitHubRepositoryName,
                        gitHubIssueNumber),
                    cancellationToken);

                var user = await dataContext.Users
                    .AsQueryable()
                    .SingleAsync(
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

                return issue.Value;
            });

            await UpsertIssueBountyCommentAsync(
                gitHubOwnerName, 
                gitHubRepositoryName, 
                databaseIssue, 
                cancellationToken);
        }

        private async Task UpsertIssueBountyCommentAsync(
            string gitHubOwnerName, 
            string gitHubRepositoryName, 
            Issue issue, 
            CancellationToken cancellationToken)
        {
            var totalBountyAmountInHundredsByContributors = await dataContext.Bounties
                .Include(x => x.Creator.GitHub)
                .AsQueryable()
                .Where(x => x.IssueId == issue.Id)
                .GroupBy(x => x.Creator)
                .Select(x => new
                {
                    Creator = x.Key,
                    AmountInHundreds = x.Sum(b => b.AmountInHundreds)
                })
                .OrderByDescending(x => x.AmountInHundreds)
                .Take(10)
                .ToArrayAsync(cancellationToken);

            var totalAmountInHundreds = totalBountyAmountInHundredsByContributors.Sum(x => x.AmountInHundreds);
            
            var messageTextBuilder = new StringBuilder();
            messageTextBuilder.AppendLine($"A ${totalAmountInHundreds / 100} bounty has been put on this issue over at bountyhunt.io.");

            messageTextBuilder.AppendLine();
            messageTextBuilder.AppendLine();
            
            messageTextBuilder.AppendLine("Top contributors:");

            foreach (var pair in totalBountyAmountInHundredsByContributors)
            {
                if (pair.Creator.GitHub == null)
                    throw new InvalidOperationException("A creator was not connected to GitHub.");

                messageTextBuilder.AppendLine($"- ${pair.AmountInHundreds / 100} by @{pair.Creator.GitHub.Username}");
            }

            messageTextBuilder.AppendLine(GitHubCommentHelper.RenderSpoiler(
                "What is this?",
                "bountyhunt.io is an open source service that allows people to put bounties on issues, and allows bountyhunters to claim those bounties.\n\nIn a way, we're helping people get paid for the open source work they do, and for people to live off of open source development.\n\nAdditionally, we help bring attention to the issues that matter most in the open source community.\n\nThis comment will only appear once ever, and will be modified if new bounties arrive, to reduce spam."));

            await mediator.Send(
                new UpsertIssueCommentCommand(
                    gitHubOwnerName,
                    gitHubRepositoryName,
                    issue.GitHub.Number,
                    messageTextBuilder.ToString()),
                cancellationToken);
        }

        private async Task AddPaymentForBountyAsync(
            string eventId,
            SetupIntent paymentIntent, 
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
                .AsQueryable()
                .SingleOrDefaultAsync(
                    bounty =>
                        bounty.IssueId == issue.Id &&
                        bounty.CreatorId == user.Id,
                    cancellationToken);
        }

        public override bool CanHandle(string type)
        {
            return type == Events.SetupIntentSucceeded;
        }
    }
}