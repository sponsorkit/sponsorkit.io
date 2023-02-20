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
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;
using Stripe;
using Issue = Octokit.Issue;
using Repository = Octokit.Repository;
using SetupIntentRequest = Sponsorkit.Api.Domain.Controllers.Api.Bounties.SetupIntent.PostRequest;

namespace Sponsorkit.Tests.Jobs;

[TestClass]
public class PayoutJobTest
{
    record GitHubContext(
        Repository Repository,
        Issue Issue);

    [TestMethod]
    public async Task FullFlow_OneBountyOnIssue_ApplicationFeeAndBountyAmountAreTransferred()
    {
        //Arrange & act
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var gitHubContext = await ConfigureGitHubAsync(environment);

        var bountyAuthorUser = await CreateUserAndPlaceBountyAsync(
            environment, 
            gitHubContext);

        var bountyClaimerUser = await CreateUserAndMakeClaimRequestAsync(
            environment, 
            gitHubContext);

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
        Assert.AreEqual(0, preconditionClaimerBalance.Pending.Single().Amount);

        var lambdaContext = Substitute.For<ILambdaContext>();
        lambdaContext.RemainingTime.Returns(TimeSpan.FromMinutes(5));
        
        await WaitForAccountToBeReadyAsync(environment, bountyClaimerUser);
        
        //Act
        await JobsStartup.Handler(
            new JobRequest("payout"),
            lambdaContext);

        await environment.Stripe.WaitForWebhookAsync(e => e.Type == Events.PaymentIntentSucceeded);
        
        //Assert
        var platformFees = await environment.Stripe.ApplicationFeeService
            .ListAutoPagingAsync(new ApplicationFeeListOptions())
            .ToListAsync();
        Assert.AreEqual(
            preconditionPlatformFees.Sum(x => x.Amount) + 0_50,
            platformFees.Sum(x => x.Amount));
        
        var claimerBalance = await environment.Stripe.BalanceService.GetAsync(new RequestOptions()
        {
            StripeAccount = bountyClaimerUser.StripeConnectId
        });
        Assert.AreEqual(9_40, claimerBalance.Pending.Single().Amount);
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

    private static async Task<GitHubContext> ConfigureGitHubAsync(SponsorkitIntegrationTestEnvironment environment)
    {
        var testRepository = new TestRepository();
        environment.GitHub.FakeClient.Repository
            .Get(Arg.Any<string>(), Arg.Any<string>())
            .Returns(testRepository);

        var testIssue = new TestIssue();
        environment.GitHub.FakeClient.Issue
            .Get(
                Arg.Any<string>(),
                Arg.Any<string>(),
                Arg.Any<int>())
            .Returns(testIssue);

        var gitHubContext = new GitHubContext(
            testRepository,
            testIssue);

        var repository = await environment.Database.RepositoryBuilder
            .WithGitHubInformation(
                gitHubContext.Repository.Id,
                gitHubContext.Repository.Owner.Name,
                gitHubContext.Repository.Name)
            .BuildAsync();

        await environment.Database.IssueBuilder
            .WithGitHubInformation(
                gitHubContext.Issue.Id,
                gitHubContext.Issue.Number,
                "some-title")
            .WithRepository(repository)
            .BuildAsync();
        return gitHubContext;
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
        GitHubContext gitHubContext)
    {
        var bountyAuthorUser = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder
                .WithDefaultPaymentMethod(environment.Stripe.PaymentMethodBuilder))
            .WithGitHub(1, "author", "")
            .BuildAsync();

        var customer = await environment.Stripe.CustomerService
            .GetAsync(bountyAuthorUser.StripeCustomerId);

        var setupIntentPost = environment.ServiceProvider.GetRequiredService<SetupIntentPost>();
        setupIntentPost.FakeAuthentication(bountyAuthorUser);

        var result = await setupIntentPost.HandleAsync(new SetupIntentRequest(
            new GitHubIssueRequest(
                gitHubContext.Repository.Owner.Name,
                gitHubContext.Repository.Name,
                gitHubContext.Issue.Number),
            10_00));
        var response = result.ToResponseObject();

        var refreshedIntent = await environment.Stripe.SetupIntentService.ConfirmAsync(response.PaymentIntent.Id);
        Assert.AreEqual("succeeded", refreshedIntent.Status);

        await environment.Stripe.WaitForWebhookAsync(ev => ev.Type == Events.SetupIntentSucceeded);

        return bountyAuthorUser;
    }

    private static async Task<User> CreateUserAndMakeClaimRequestAsync(
        SponsorkitIntegrationTestEnvironment environment, 
        GitHubContext gitHubContext)
    {
        var bountyClaimerUser = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder
                .WithAccount(environment.Stripe.AccountBuilder
                    .WithDetailsSubmitted()))
            .WithGitHub(2, "claimer", "")
            .BuildAsync();

        var fakeGitHubPullRequestNumber = 1338;
        environment.GitHub.FakeClient.PullRequest
            .Get(
                gitHubContext.Repository.Id,
                fakeGitHubPullRequestNumber)
            .Returns(environment.GitHub.PullRequestBuilder
                .WithUser(new TestGitHubUser()
                {
                    Id = (int)bountyClaimerUser.GitHub.Id
                })
                .BuildAsync());

        var claimsPost = environment.ServiceProvider.GetRequiredService<ClaimsPost>();
        claimsPost.FakeAuthentication(bountyClaimerUser);

        var result = await claimsPost.HandleAsync(new ClaimsRequest(
            gitHubContext.Issue.Id,
            fakeGitHubPullRequestNumber));
        Assert.IsInstanceOfType<OkResult>(result);

        return bountyClaimerUser;
    }
}