using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Sponsorkit.Api.Domain.Controllers.Api.Bounties.SetupIntent;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;
using Stripe;

namespace Sponsorkit.Tests.Jobs;

[TestClass]
public class PayoutJobTest
{

    [TestMethod]
    public async Task FullFlow_TODO()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        environment.GitHub.FakeClient.Repository
            .Get(
                "repository-owner",
                "repository-name")
            .Returns(new TestRepository());

        environment.GitHub.FakeClient.Issue
            .Get(
                "repository-owner",
                "repository-name",
                1337)
            .Returns(new TestIssue());

        var authenticatedUser = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder
                .WithDefaultPaymentMethod(environment.Stripe.PaymentMethodBuilder))
            .BuildAsync();

        var setupIntentPost = environment.ServiceProvider.GetRequiredService<SetupIntentPost>();
        setupIntentPost.FakeAuthentication(authenticatedUser);
        
        var preconditionBounty = await environment.Database.WithoutCachingAsync(async context =>
            await context.Bounties.SingleOrDefaultAsync());
        Assert.IsNull(preconditionBounty);
        
        var result = await setupIntentPost.HandleAsync(new PostRequest(
            new GitHubIssueRequest(
                "repository-owner",
                "repository-name",
                1337),
            10_00));
        var response = result.ToResponseObject();
        
        var refreshedIntent = await environment.Stripe.SetupIntentService.ConfirmAsync(response.PaymentIntent.Id);
        Assert.AreEqual("succeeded", refreshedIntent.Status);
        
        await environment.Stripe.WaitForWebhookAsync(ev => ev.Type == Events.SetupIntentSucceeded);
        
        //Act
        
        //Assert

        Assert.Fail();
    }
}