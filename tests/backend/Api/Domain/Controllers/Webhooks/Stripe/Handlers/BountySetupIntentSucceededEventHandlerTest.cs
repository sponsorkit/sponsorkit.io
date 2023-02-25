using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Sponsorkit.Api.Domain.Controllers.Api.Bounties.SetupIntent;
using Sponsorkit.BusinessLogic.Domain.Helpers;
using Sponsorkit.BusinessLogic.Domain.Mediatr.GitHub;
using Sponsorkit.BusinessLogic.Domain.Stripe.Handlers;
using Sponsorkit.BusinessLogic.Domain.Stripe.Handlers.SetupIntentSucceeded;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Stripe;

namespace Sponsorkit.Tests.Api.Domain.Controllers.Webhooks.Stripe.Handlers;

[TestClass]
public class BountySetupIntentSucceededEventHandlerTest
{
    [TestMethod]
    public async Task FullFlow_BountyDoesNotExist_CreatesBounty()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder
                .WithDefaultPaymentMethod(environment.Stripe.PaymentMethodBuilder))
            .BuildAsync();

        var setupIntentPost = environment.ServiceProvider.GetRequiredService<SetupIntentPost>();
        setupIntentPost.FakeAuthentication(authenticatedUser);
        
        var preconditionBounty = await environment.Database.WithoutCachingAsync(async context =>
            await context.Bounties.SingleOrDefaultAsync());
        Assert.IsNull(preconditionBounty);

        var issue = await environment.GitHub.IssueBuilder.BuildAsync();
        
        //Act
        var result = await setupIntentPost.HandleAsync(new PostRequest(
            new GitHubIssueRequest(
                issue.Repository.Owner.Name,
                issue.Repository.Name,
                issue.Number),
            10_00));
        var response = result.ToResponseObject();
        var refreshedIntent = await environment.Stripe.SetupIntentService.ConfirmAsync(response.PaymentIntent.Id);
        Assert.AreEqual("succeeded", refreshedIntent.Status);

        await environment.Stripe.WaitForWebhookAsync(ev => ev.Type == Events.SetupIntentSucceeded);
        
        //Assert
        var bounty = await environment.Database.WithoutCachingAsync(async context =>
            await context.Bounties.SingleOrDefaultAsync());
        Assert.IsNotNull(bounty);
    }

    [TestMethod]
    public async Task FullFlow_BountyExistsAlready_AttachesPaymentToBounty()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder
                .WithDefaultPaymentMethod(environment.Stripe.PaymentMethodBuilder))
            .BuildAsync();

        var setupIntentPost = environment.ServiceProvider.GetRequiredService<SetupIntentPost>();
        setupIntentPost.FakeAuthentication(authenticatedUser);
        
        var preconditionBounty = await environment.Database.WithoutCachingAsync(async context =>
            await context.Bounties.SingleOrDefaultAsync());
        Assert.IsNull(preconditionBounty);

        var issue = await environment.GitHub.IssueBuilder.BuildAsync();
        
        //Act
        var result = await setupIntentPost.HandleAsync(new PostRequest(
            new GitHubIssueRequest(
                issue.Repository.Owner.Name,
                issue.Repository.Name,
                issue.Number),
            10_00));
        var response = result.ToResponseObject();
        var refreshedIntent = await environment.Stripe.SetupIntentService.ConfirmAsync(response.PaymentIntent.Id);
        Assert.AreEqual("succeeded", refreshedIntent.Status);

        await environment.Stripe.WaitForWebhookAsync(ev => ev.Type == Events.SetupIntentSucceeded);
        
        //Assert
        var bounty = await environment.Database.WithoutCachingAsync(async context =>
            await context.Bounties
                .Include(x => x.Payments)
                .SingleAsync());
        
        var payment = bounty.Payments.SingleOrDefault();
        Assert.IsNotNull(payment);

        Assert.AreEqual(10_00, payment.AmountInHundreds);
    }

    [TestMethod]
    public async Task FullFlow_Success_UpsertsGitHubComment()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder
                .WithDefaultPaymentMethod(environment.Stripe.PaymentMethodBuilder))
            .BuildAsync();

        var setupIntentPost = environment.ServiceProvider.GetRequiredService<SetupIntentPost>();
        setupIntentPost.FakeAuthentication(authenticatedUser);
        
        var preconditionBounty = await environment.Database.WithoutCachingAsync(async context =>
            await context.Bounties.SingleOrDefaultAsync());
        Assert.IsNull(preconditionBounty);

        var issue = await environment.GitHub.IssueBuilder.BuildAsync();
        
        //Act
        var result = await setupIntentPost.HandleAsync(new PostRequest(
            new GitHubIssueRequest(
                issue.Repository.Owner.Name,
                issue.Repository.Name,
                issue.Number),
            10_00));
        var response = result.ToResponseObject();
        var refreshedIntent = await environment.Stripe.SetupIntentService.ConfirmAsync(response.PaymentIntent.Id);
        Assert.AreEqual("succeeded", refreshedIntent.Status);

        await environment.Stripe.WaitForWebhookAsync(ev => ev.Type == Events.SetupIntentSucceeded);
        
        //Assert
        environment.MediatorInterceptor
            .Received(1)
            .Intercept(Arg.Any<UpsertIssueCommentCommand>());
    }
        
    [TestMethod]
    public async Task CanHandle_ProperMetadataAndType_CanHandle()
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
        var canHandle = eventHandler.CanHandleWebhookType(Events.SetupIntentSucceeded, new SetupIntent()
        {
            Metadata = new Dictionary<string, string>()
            {
                { UniversalMetadataKeys.Type, UniversalMetadataTypes.BountySetupIntent }
            }
        });
            
        //Assert
        Assert.IsTrue(canHandle);
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
        var canHandle = eventHandler.CanHandleWebhookType(Events.SetupIntentSucceeded, new SetupIntent()
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
    public async Task CanHandle_MetadataDoesNotContainTypeKey_CanNotHandle()
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
        var canHandle = eventHandler.CanHandleWebhookType(Events.SetupIntentSucceeded, new SetupIntent()
        {
            Metadata = new Dictionary<string, string>()
            {
                { "incorrect-type-key", "some-unknown-type" }
            }
        });
            
        //Assert
        Assert.IsFalse(canHandle);
    }

    private static BountySetupIntentSucceededEventHandler GetEventHandler(SponsorkitIntegrationTestEnvironment environment)
    {
        return environment.ServiceProvider
            .GetRequiredService<IEnumerable<IStripeEventHandler>>()
            .OfType<BountySetupIntentSucceededEventHandler>()
            .Single();
    }
}