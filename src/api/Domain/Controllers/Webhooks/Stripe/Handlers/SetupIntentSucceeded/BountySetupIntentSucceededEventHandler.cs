using System;
using System.Data;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Sponsorkit.Domain.Controllers.Api.Bounties;
using Sponsorkit.Domain.Controllers.Api.Bounties.SetupIntent;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Domain.Models.Context;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers.SetupIntentSucceeded;

public class BountySetupIntentSucceededEventHandler : StripeEventHandler<SetupIntent>
{
    private readonly DataContext dataContext;
    private readonly IMediator mediator;

    public BountySetupIntentSucceededEventHandler(
        DataContext dataContext,
        IMediator mediator)
    {
        this.dataContext = dataContext;
        this.mediator = mediator;
    }

    protected override bool CanHandleWebhookType(string type)
    {
        return type == Events.SetupIntentSucceeded;
    }

    protected override bool CanHandleData(SetupIntent data)
    {
        if (!data.Metadata.ContainsKey(UniversalMetadataKeys.Type))
            return false;

        var metadataType = data.Metadata[UniversalMetadataKeys.Type];
        return metadataType == UniversalMetadataTypes.BountySetupIntent;
    }


    protected override async Task HandleAsync(string eventId, SetupIntent data, CancellationToken cancellationToken)
    {
        await HandleBountySetupIntentAsync(eventId, data, cancellationToken);
    }

    private async Task HandleBountySetupIntentAsync(string eventId, SetupIntent data, CancellationToken cancellationToken)
    {
        var amountInHundreds = long.Parse(data.Metadata[MetadataKeys.AmountInHundreds], CultureInfo.InvariantCulture);
        var gitHubIssueNumber = int.Parse(data.Metadata[MetadataKeys.GitHubIssueNumber], CultureInfo.InvariantCulture);
        var gitHubOwnerName = data.Metadata[MetadataKeys.GitHubIssueOwnerName];
        var gitHubRepositoryName = data.Metadata[MetadataKeys.GitHubIssueRepositoryName];
        var userId = Guid.Parse(data.Metadata[MetadataKeys.UserId]);

        if (amountInHundreds < Constants.MinimumBountyAmountInHundreds)
            throw new InvalidOperationException("Bounty amount is below minimum.");
            
        var databaseIssue = await dataContext.ExecuteInTransactionAsync(async () =>
        {
            var user = await dataContext.Users
                .AsQueryable()
                .SingleAsync(
                    x => x.Id == userId,
                    cancellationToken);
                
            var issue = await mediator.Send(
                new EnsureGitHubIssueInDatabaseCommand(
                    gitHubOwnerName,
                    gitHubRepositoryName,
                    gitHubIssueNumber),
                cancellationToken);

            var bounty = await GetOrCreateBountyAsync(
                issue,
                user,
                cancellationToken);

            await AddPaymentForBountyAsync(
                eventId,
                data,
                bounty,
                amountInHundreds,
                cancellationToken);

            await dataContext.SaveChangesAsync(cancellationToken);

            return issue.Value;
        }, IsolationLevel.Serializable);

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
            .AsQueryable()
            .Where(x => x.IssueId == issue.Id)
            .GroupBy(x => new
            {
                x.Creator.Id,
                Username = x.Creator.GitHub!.Username
            })
            .Select(x => new
            {
                GitHubLogin = x.Key.Username,
                AmountInHundreds = x.Sum(b => b.Payments
                    .Sum(p => p.AmountInHundreds))
            })
            .OrderByDescending(x => x.AmountInHundreds)
            .Take(10)
            .ToArrayAsync(cancellationToken);
            
        var totalAmountInHundreds = totalBountyAmountInHundredsByContributors.Sum(x => x.AmountInHundreds);
            
        var messageTextBuilder = new StringBuilder();
        messageTextBuilder.AppendLine($"A {GitHubCommentHelper.RenderBold($"${totalAmountInHundreds / 100}")} bounty has been put on {GitHubCommentHelper.RenderLink("this issue over at bountyhunt.io", LinkHelper.GetBountyLink(gitHubOwnerName, gitHubRepositoryName, issue.GitHub.Number))}.");
            
        messageTextBuilder.AppendLine();
        messageTextBuilder.AppendLine();
            
        messageTextBuilder.AppendLine(GitHubCommentHelper.RenderBold("Top contributors:"));
            
        foreach (var pair in totalBountyAmountInHundredsByContributors)
        {
            messageTextBuilder.AppendLine($"- {GitHubCommentHelper.RenderBold($"${pair.AmountInHundreds / 100}")} by @{pair.GitHubLogin}");
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
        long amountInHundreds, 
        CancellationToken cancellationToken)
    {
        var payment = new PaymentBuilder()
            .WithBounty(bounty)
            .WithAmount(
                amountInHundreds,
                FeeCalculator.GetSponsorkitFeeInHundreds(
                    amountInHundreds))
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

    private async Task<Bounty> GetOrCreateBountyAsync(
        Issue issue, 
        User user, 
        CancellationToken cancellationToken)
    {
        var bounty = await GetExistingBountyAsync(
            issue,
            user,
            cancellationToken);
        if (bounty == null)
        {
            return await CreateNewBountyAsync(
                user,
                issue,
                cancellationToken);
        }

        return bounty;
    }

    private async Task<Bounty> CreateNewBountyAsync(
        User user, 
        Issue issue, 
        CancellationToken cancellationToken)
    {
        var newBounty = new BountyBuilder()
            .WithCreator(user)
            .WithIssue(issue)
            .Build();
        await dataContext.Bounties.AddAsync(
            newBounty,
            cancellationToken);

        await dataContext.SaveChangesAsync(cancellationToken);

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
}