using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Amazon.Lambda.Core;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Sponsorkit.Api.Domain.Controllers.Api.Bounties.Claims;
using Sponsorkit.Api.Domain.Controllers.Api.Bounties.Claims.ClaimId.Verdict;
using Sponsorkit.Api.Domain.Controllers.Api.Bounties.SetupIntent;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.Jobs;
using Sponsorkit.Jobs.Domain;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Builders.Database;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;
using Stripe;
using Issue = Octokit.Issue;
using SetupIntentRequest = Sponsorkit.Api.Domain.Controllers.Api.Bounties.SetupIntent.PostRequest;

namespace Sponsorkit.Tests.Jobs;

[TestClass]
public class PayoutJobTest
{

    [TestMethod]
    public async Task FullFlow_OneBountyOnIssue_ApplicationFeeAndBountyAmountAreTransferred()
    {
        //Arrange & act
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var testIssue = await ConfigureGitHubIssueAsync(environment);

        var bountyAuthorUser = await CreateUserAndPlaceBountyAsync(
            environment,
            testIssue,
            10_00);

        var bountyClaimerUser = await CreateUserAndMakeClaimRequestAsync(
            environment,
            testIssue);

        var claimRequest = await environment.Database.WithoutCachingAsync(async context =>
            await context.BountyClaimRequests.SingleAsync());

        await ApplyVerdictToClaimAsync(
            environment,
            bountyAuthorUser,
            claimRequest,
            ClaimVerdict.Solved);

        var preconditionPlatformFees = await environment.Stripe.ApplicationFeeService
            .ListAutoPagingAsync(new ApplicationFeeListOptions())
            .ToListAsync();
        
        var preconditionClaimerBalance = await environment.Stripe.BalanceService.GetAsync(new RequestOptions()
        {
            StripeAccount = bountyClaimerUser.StripeConnectId
        });
        var priorPendingBalance = preconditionClaimerBalance.Pending.Single().Amount;

        var payoutJob = environment.ServiceProvider.GetRequiredService<PayoutJob>();

        await WaitForAccountToBeReadyAsync(environment, bountyClaimerUser);

        //Act
        var createdPaymentIntents = await payoutJob.ExecuteAsync();

        await environment.Stripe.WaitForWebhookAsync(e => e.Type == Events.PaymentIntentSucceeded);

        //Assert
        var platformFees = await environment.Stripe.ApplicationFeeService
            .ListAutoPagingAsync(new ApplicationFeeListOptions())
            .ToListAsync();
        Assert.AreEqual(
            preconditionPlatformFees.Sum(x => x.Amount) + 0_50,
            platformFees.Sum(x => x.Amount));

        var createdPaymentIntent = createdPaymentIntents.Single();
        var balanceTransaction = createdPaymentIntent.LatestCharge.BalanceTransaction;
        Assert.AreEqual(9_40m, balanceTransaction.Net / balanceTransaction.ExchangeRate!.Value, 0_03m);
    }

    private static async Task ApplyVerdictToClaimAsync(
        SponsorkitIntegrationTestEnvironment environment,
        User bountyAuthorUser,
        BountyClaimRequest claimRequest,
        ClaimVerdict verdict)
    {
        var verdictPost = environment.ServiceProvider.GetRequiredService<VerdictPost>();
        verdictPost.FakeAuthentication(bountyAuthorUser);

        await verdictPost.HandleAsync(new VerdictPostRequest(
            claimRequest.Id,
            verdict));
    }

    private static async Task<Issue> ConfigureGitHubIssueAsync(SponsorkitIntegrationTestEnvironment environment)
    {
        var testIssue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();

        var repository = await environment.Database.RepositoryBuilder
            .WithGitHubInformation(
                GitHubTestConstants.RepositoryId,
                GitHubTestConstants.RepositoryOwnerName,
                GitHubTestConstants.RepositoryName)
            .BuildAsync();

        await environment.Database.IssueBuilder
            .WithGitHubInformation(
                testIssue.Id,
                testIssue.Number,
                "some-title")
            .WithRepository(repository)
            .BuildAsync();

        return testIssue;
    }

    private static async Task WaitForAccountToBeReadyAsync(SponsorkitIntegrationTestEnvironment environment, User bountyClaimerUser)
    {
        var cancellationToken = new CancellationTokenSource(TimeSpan.FromMinutes(3)).Token;
        while (!cancellationToken.IsCancellationRequested)
        {
            var account = await environment.Stripe.AccountService.GetAsync(
                bountyClaimerUser.StripeConnectId,
                cancellationToken: cancellationToken);
            if (account.ChargesEnabled && account.PayoutsEnabled)
                break;

            await Task.Delay(1000, cancellationToken);
        }
    }

    private static async Task<User> CreateUserAndPlaceBountyAsync(
        SponsorkitIntegrationTestEnvironment environment,
        Issue issue,
        int bountyAmountInHundreds)
    {
        var bountyAuthorUser = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder
                .WithDefaultPaymentMethod(environment.Stripe.PaymentMethodBuilder))
            .WithGitHub(GitHubUserType.SponsorkitBot)
            .BuildAsync();

        var customer = await environment.Stripe.CustomerService
            .GetAsync(bountyAuthorUser.StripeCustomerId);

        var setupIntentPost = environment.ServiceProvider.GetRequiredService<SetupIntentPost>();
        setupIntentPost.FakeAuthentication(bountyAuthorUser);

        var result = await setupIntentPost.HandleAsync(new SetupIntentRequest(
            new GitHubIssueRequest(
                GitHubTestConstants.RepositoryOwnerName,
                GitHubTestConstants.RepositoryName,
                issue.Number),
            bountyAmountInHundreds));
        var response = result.ToResponseObject();

        var refreshedIntent = await environment.Stripe.SetupIntentService.ConfirmAsync(response.PaymentIntent.Id, new()
        {
            ReturnUrl = "https://sponsorkit.io/landing/stripe-setup-intent",
        });
        Assert.AreEqual("succeeded", refreshedIntent.Status);

        await environment.Stripe.WaitForWebhookAsync(ev => ev.Type == Events.SetupIntentSucceeded);

        return bountyAuthorUser;
    }

    private static async Task<User> CreateUserAndMakeClaimRequestAsync(
        SponsorkitIntegrationTestEnvironment environment,
        Issue issue)
    {
        var bountyClaimerUser = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder
                .WithAccount(environment.Stripe.AccountBuilder
                    .WithDetailsSubmitted()))
            .WithGitHub(GitHubUserType.BountyhuntBot)
            .BuildAsync();

        var pullRequest = await environment.GitHub.BountyhuntBot.PullRequestBuilder.BuildAsync();

        var claimsPost = environment.ServiceProvider.GetRequiredService<ClaimsPost>();
        claimsPost.FakeAuthentication(bountyClaimerUser);

        var result = await claimsPost.HandleAsync(new ClaimsRequest(
            issue.Id,
            pullRequest.Number));
        Assert.IsInstanceOfType<OkResult>(result);

        return bountyClaimerUser;
    }
}