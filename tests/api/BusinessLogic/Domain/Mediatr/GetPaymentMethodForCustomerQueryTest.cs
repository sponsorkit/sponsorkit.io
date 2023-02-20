using System;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.BusinessLogic.Domain.Mediatr.Stripe;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.BusinessLogic.Domain.Mediatr;

[TestClass]
public class GetPaymentMethodForCustomerQueryTest
{
    [TestMethod]
    public async Task Handle_CustomerNotFound_ThrowsException()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();
        
        //Act
        var exception = await Assert.ThrowsExceptionAsync<InvalidOperationException>(async () =>
        {
            await environment.Mediator.Send(
                new GetPaymentMethodForCustomerQuery("customer-id"));
        });
            
        //Assert
        Assert.AreEqual("The customer could not be found.", exception.Message);
    }
        
    [TestMethod]
    public async Task Handle_CustomerHasDefaultPaymentMethod_ReturnsDefaultPaymentMethod()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();
        //
        // var customer = await environment.Stripe.CustomerBuilder
        //     .WithUser(await environment.Database.UserBuilder.BuildAsync())
        //     .WithDefaultPaymentMethod(environment.Stripe.PaymentMethodBuilder)
        //     .BuildAsync();
        //
        // var defaultPaymentMethod = await environment.Stripe.PaymentMethodService.GetAsync(
        //     customer.InvoiceSettings.DefaultPaymentMethodId);
        // Assert.IsNotNull(defaultPaymentMethod);
        //
        // //Act
        // var fetchedPaymentMethod = await environment.Mediator.Send(
        //     new GetPaymentMethodForCustomerQuery(customer.Id));
        //     
        // //Assert
        // Assert.AreEqual(
        //     defaultPaymentMethod.Id, 
        //     fetchedPaymentMethod.Id);
        Assert.Fail();
    }
        
    [TestMethod]
    public async Task Handle_CustomerDoesNotHaveDefaultPaymentMethod_ReturnsFirstPaymentMethod()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var customer = await environment.Stripe.CustomerBuilder
            .WithUser(await environment.Database.UserBuilder.BuildAsync())
            .BuildAsync();

        var paymentMethod = await environment.Stripe.PaymentMethodBuilder
            .WithCustomer(customer)
            .BuildAsync();
        
        //Act
        var fetchedPaymentMethod = await environment.Mediator.Send(
            new GetPaymentMethodForCustomerQuery(customer.Id));
            
        //Assert
        Assert.AreEqual(
            paymentMethod.Id, 
            fetchedPaymentMethod.Id);
    }
}