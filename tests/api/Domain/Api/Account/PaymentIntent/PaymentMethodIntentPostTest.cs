using System;
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
                    .WithCvc("123")
                    .WithExpiry(10, DateTime.Now.Year + 1)
                    .WithCardNumber(4242_4242_4242_4242.ToString())))
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<PaymentMethodIntentPost>();
        handler.FakeAuthentication(user.Id);

        //Act
        var result = await handler.HandleAsync();
    
        //Assert
        Assert.IsNotNull(result.ToResponseObject().ExistingPaymentMethodId);
    }
}