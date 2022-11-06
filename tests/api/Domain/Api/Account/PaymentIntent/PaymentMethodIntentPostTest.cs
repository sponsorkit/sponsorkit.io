using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Controllers.Api.Account.PaymentMethod.Intent;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Account.PaymentIntent;

[TestClass]
public class PaymentMethodIntentPostTest
{
    [TestMethod]
    public async Task HandleAsync_PaymentMethodPresent_ReturnsCreatedSetupIntent()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder
                .WithDefaultPaymentMethod(environment.Stripe.PaymentMethodBuilder
                    .WithCvc()))
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<PaymentMethodIntentPost>();
        handler.FakeAuthentication(user.Id);

        var stripeCustomerService = environment.Stripe.CustomerService;
        await stripeCustomerService.DeleteAsync(user.StripeCustomerId);

        var customer = await stripeCustomerService.GetAsync(user.StripeCustomerId);
        Assert.IsTrue(customer.Deleted);

        //Act
        var result = await handler.HandleAsync();

        //Assert
        Assert.IsInstanceOfType(result.Result, typeof(NoContentResult));
    }
}