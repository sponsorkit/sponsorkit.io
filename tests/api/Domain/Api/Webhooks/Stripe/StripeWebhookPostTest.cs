using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Webhooks.Stripe;

[TestClass]
public class StripeWebhookPostTest
{
    [TestMethod]
    public async Task HandleAsync_StripeSignatureNotPresent_ReturnsBadRequest()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var handler = environment.ServiceProvider.GetRequiredService<StripeWebhookPost>();
        handler.EnsureControllerContext();
            
        //Act
        var result = await handler.HandleAsync();
            
        //Assert
        Assert.IsInstanceOfType<BadRequestObjectResult>(result);
    }
    
    [TestMethod]
    public async Task HandleAsync_MultipleElligibleHandlersFound_ExecutesEveryHandler()
    {
        //Arrange
        var fakeHandler1 = Substitute.For<IStripeEventHandler>();
        var fakeHandler2 = Substitute.For<IStripeEventHandler>();
        
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new ()
        {
            IocConfiguration = services =>
            {
                services.RemoveAll<IStripeEventHandler>();
                
                services.AddSingleton(fakeHandler1);
                services.AddSingleton(fakeHandler2);
            }
        });

        var handler = environment.ServiceProvider.GetRequiredService<StripeWebhookPost>();
        handler.EnsureControllerContext();
        handler.Request.Headers.Add("Stripe-Signature", "some-signature");
            
        //Act
        var result = await handler.HandleAsync();
            
        //Assert
        await fakeHandler1
            .ReceivedWithAnyArgs(1)
            .HandleAsync(
                default!,
                default!,
                default);
        
        await fakeHandler2
            .ReceivedWithAnyArgs(1)
            .HandleAsync(
                default!,
                default!,
                default);
    }
        
    [TestMethod]
    public async Task HandleAsync_MultipleElligibleHandlersFound_ReturnsOk()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_NoHandlersFound_ReturnsOk()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_EventAlreadyHandled_ReturnsOk()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}