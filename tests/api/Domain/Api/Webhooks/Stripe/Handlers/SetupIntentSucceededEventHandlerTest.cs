using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Sponsorkit.Domain.Controllers.Api.Bounties.SetupIntent;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers.SetupIntentSucceeded;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;
using Stripe;

namespace Sponsorkit.Tests.Domain.Api.Webhooks.Stripe.Handlers;

[TestClass]
public class SetupIntentSucceededEventHandlerTest
{
    [TestMethod]
    public async Task FullFlow_CustomerExistsInStripe_UpdatesDefaultPaymentMethod()
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

        var stripeCustomer = await environment.Stripe.CustomerBuilder.BuildAsync();
        
        var authenticatedUser = await environment.Database.UserBuilder
            .WithStripeCustomer(stripeCustomer)
            .BuildAsync();

        var paymentMethod = await environment.Stripe.PaymentMethodBuilder
            .WithCustomer(stripeCustomer)
            .BuildAsync();

        var setupIntentPost = environment.ServiceProvider.GetRequiredService<SetupIntentPost>();
        setupIntentPost.FakeAuthentication(authenticatedUser);
        
        var preStripeCustomer = await environment.Stripe.CustomerService.GetAsync(authenticatedUser.StripeCustomerId);
        Assert.IsNull(preStripeCustomer.DefaultSourceId);
        
        //Act
        var result = await setupIntentPost.HandleAsync(new PostRequest(
            new GitHubIssueRequest(
                "repository-owner",
                "repository-name",
                1337),
            10_00));
        var response = result.ToResponseObject();
        
        var refreshedIntent = await environment.Stripe.SetupIntentService.ConfirmAsync(response.PaymentIntent.Id);
        Assert.AreEqual("succeeded", refreshedIntent.Status);
        
        //Assert
        var refreshedStripeCustomer = await environment.Stripe.CustomerService.GetAsync(authenticatedUser.StripeCustomerId);
        Assert.IsNotNull(refreshedStripeCustomer.DefaultSourceId);
    }
        
    [TestMethod]
    public async Task CanHandle_UnrecognizedTypeGiven_CanNotHandle()
    {
        //Arrange
        var fakeMediator = Substitute.For<IMediator>();
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new ()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeMediator);
            }
        });

        var eventHandler = GetEventHandler(environment);

        //Act
        var canHandle = eventHandler.CanHandleData(new SetupIntent()
        {
            Metadata = new Dictionary<string, string>()
            {
                { UniversalMetadataKeys.Type, "some-unknown-type" }
            }
        });
            
        //Assert
        Assert.IsFalse(canHandle);
    }
        
    [TestMethod]
    public async Task CanHandle_TypeIsRight_CanHandle()
    {
        //Arrange
        var fakeMediator = Substitute.For<IMediator>();
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new ()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeMediator);
            }
        });

        var eventHandler = GetEventHandler(environment);

        //Act
        var canHandle = eventHandler.CanHandleData(new SetupIntent()
        {
            Metadata = new Dictionary<string, string>()
            {
                { UniversalMetadataKeys.Type, Events.SetupIntentSucceeded }
            }
        });
            
        //Assert
        Assert.IsTrue(canHandle);
    }

    private static SetupIntentSucceededEventHandler GetEventHandler(SponsorkitIntegrationTestEnvironment environment)
    {
        return environment.ServiceProvider
            .GetRequiredService<IEnumerable<IStripeEventHandler>>()
            .OfType<SetupIntentSucceededEventHandler>()
            .Single();
    }
}