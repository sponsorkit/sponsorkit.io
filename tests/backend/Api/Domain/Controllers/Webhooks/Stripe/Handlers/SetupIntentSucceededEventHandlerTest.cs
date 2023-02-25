using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Sponsorkit.Api.Domain.Controllers.Api.Bounties.SetupIntent;
using Sponsorkit.BusinessLogic.Domain.Stripe.Handlers;
using Sponsorkit.BusinessLogic.Domain.Stripe.Handlers.SetupIntentSucceeded;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Stripe;

namespace Sponsorkit.Tests.Api.Domain.Controllers.Webhooks.Stripe.Handlers;

[TestClass]
public class SetupIntentSucceededEventHandlerTest
{
    [TestMethod]
    public async Task FullFlow_CustomerExistsInStripe_UpdatesDefaultPaymentMethod()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();
        
        var authenticatedUser = await environment.Database.UserBuilder
            .WithoutStripeCustomer()
            .BuildAsync();

        var stripeCustomer = await environment.Stripe.CustomerBuilder
            .WithUser(authenticatedUser)
            .BuildAsync();

        authenticatedUser.StripeCustomerId = stripeCustomer.Id;
        await environment.Database.Context.SaveChangesAsync();

        var paymentMethod = await environment.Stripe.PaymentMethodBuilder
            .WithCustomer(stripeCustomer)
            .BuildAsync();

        var setupIntentPost = environment.ServiceProvider.GetRequiredService<SetupIntentPost>();
        setupIntentPost.FakeAuthentication(authenticatedUser);
        
        var preStripeCustomer = await environment.Stripe.CustomerService.GetAsync(
            authenticatedUser.StripeCustomerId,
            GetCustomerGetOptions());
        Assert.IsNull(preStripeCustomer.InvoiceSettings.DefaultPaymentMethod);

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
        var refreshedStripeCustomer = await environment.Stripe.CustomerService.GetAsync(
            authenticatedUser.StripeCustomerId,
            GetCustomerGetOptions());
        Assert.IsNotNull(refreshedStripeCustomer.InvoiceSettings.DefaultPaymentMethod);
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
        var canHandle = eventHandler.CanHandleWebhookType("some-unknown-type", new SetupIntent());
            
        //Assert
        Assert.IsFalse(canHandle);
    }
        
    [TestMethod]
    public async Task CanHandle_TypeIsRightAndStatusIsSucceeded_CanHandle()
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
            Status = "succeeded"
        });
            
        //Assert
        Assert.IsTrue(canHandle);
    }
        
    [TestMethod]
    public async Task CanHandle_TypeIsRightAndStatusIsNotSucceeded_CanHandle()
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
            Status = "failed"
        });
            
        //Assert
        Assert.IsFalse(canHandle);
    }

    private static SetupIntentSucceededEventHandler GetEventHandler(SponsorkitIntegrationTestEnvironment environment)
    {
        return environment.ServiceProvider
            .GetRequiredService<IEnumerable<IStripeEventHandler>>()
            .OfType<SetupIntentSucceededEventHandler>()
            .Single();
    }

    private static CustomerGetOptions GetCustomerGetOptions()
    {
        return new CustomerGetOptions()
        {
            Expand = new ()
            {
                "invoice_settings.default_payment_method"
            }
        };
    }
}