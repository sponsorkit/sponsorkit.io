using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Primitives;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Sponsorkit.Api.Domain.Controllers.Webhooks.Stripe;
using Sponsorkit.BusinessLogic.Domain.Stripe;
using Sponsorkit.BusinessLogic.Domain.Stripe.Handlers;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Stripe;

namespace Sponsorkit.Tests.Domain.Api.Webhooks.Stripe;

[TestClass]
public class StripeWebhookPostTest
{
    [TestMethod]
    public async Task HandleAsync_StripeSignatureNotPresent_ReturnsBadRequest()
    {
        ActionResult result = null;
        try
        {
            //Arrange
            await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

            var handler = environment.ServiceProvider.GetRequiredService<StripeWebhookPost>();
            handler.EnsureControllerContext();
            handler.Request.Headers.Add("Stripe-Signature", "some-signature");

            //Act
            result = await handler.HandleAsync();
        }
        catch (AggregateException)
        {
            //ignored - thrown by Dispose of entrypoint if a background error occured, which was the case here.
        }

        //Assert
        Assert.IsInstanceOfType<BadRequestObjectResult>(result);
    }
    
    [TestMethod]
    public async Task HandleAsync_MultipleElligibleHandlersFound_ExecutesEveryHandler()
    {
        //Arrange
        var fakeHandler1 = Substitute.For<IStripeEventHandler>();
        fakeHandler1
            .CanHandleWebhookType(Arg.Any<string>(), Arg.Any<object>())
            .Returns(true);
        
        var fakeHandler2 = Substitute.For<IStripeEventHandler>();
        fakeHandler2
            .CanHandleWebhookType(Arg.Any<string>(), Arg.Any<object>())
            .Returns(true);

        var fakeEventFactory = Substitute.For<IEventFactory>();
        fakeEventFactory
            .CreateEvent(Arg.Any<string>(), Arg.Any<StringValues>())
            .Returns(new Event()
            {
                Data = new EventData()
            });

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new ()
        {
            IocConfiguration = services =>
            {
                services.RemoveAll<IStripeEventHandler>();
                
                services.AddSingleton(fakeHandler1);
                services.AddSingleton(fakeHandler2);

                services.AddSingleton(fakeEventFactory);
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
        var fakeHandler1 = Substitute.For<IStripeEventHandler>();
        fakeHandler1
            .CanHandleWebhookType(Arg.Any<string>(), Arg.Any<object>())
            .Returns(true);
        
        var fakeHandler2 = Substitute.For<IStripeEventHandler>();
        fakeHandler2
            .CanHandleWebhookType(Arg.Any<string>(), Arg.Any<object>())
            .Returns(true);

        var fakeEventFactory = Substitute.For<IEventFactory>();
        fakeEventFactory
            .CreateEvent(Arg.Any<string>(), Arg.Any<StringValues>())
            .Returns(new Event()
            {
                Data = new EventData()
            });

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new ()
        {
            IocConfiguration = services =>
            {
                services.RemoveAll<IStripeEventHandler>();
                
                services.AddSingleton(fakeHandler1);
                services.AddSingleton(fakeHandler2);

                services.AddSingleton(fakeEventFactory);
            }
        });

        var handler = environment.ServiceProvider.GetRequiredService<StripeWebhookPost>();
        handler.EnsureControllerContext();
        handler.Request.Headers.Add("Stripe-Signature", "some-signature");
            
        //Act
        var result = await handler.HandleAsync();
            
        //Assert
        Assert.IsInstanceOfType<OkResult>(result);
    }
        
    [TestMethod]
    public async Task HandleAsync_NoHandlersFound_ReturnsOk()
    {
        //Arrange
        var fakeEventFactory = Substitute.For<IEventFactory>();
        fakeEventFactory
            .CreateEvent(Arg.Any<string>(), Arg.Any<StringValues>())
            .Returns(new Event()
            {
                Data = new EventData()
            });

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new ()
        {
            IocConfiguration = services =>
            {
                services.RemoveAll<IStripeEventHandler>();

                services.AddSingleton(fakeEventFactory);
            }
        });

        var handler = environment.ServiceProvider.GetRequiredService<StripeWebhookPost>();
        handler.EnsureControllerContext();
        handler.Request.Headers.Add("Stripe-Signature", "some-signature");
            
        //Act
        var result = await handler.HandleAsync();
            
        //Assert
        Assert.IsInstanceOfType<OkResult>(result);
    }
        
    [TestMethod]
    public async Task HandleAsync_EventAlreadyHandled_ReturnsOk()
    {
        //Arrange
        var fakeHandler = Substitute.For<IStripeEventHandler>();
        fakeHandler
            .CanHandleWebhookType(Arg.Any<string>(), Arg.Any<object>())
            .Returns(true);

        fakeHandler
            .HandleAsync(Arg.Any<string>(), Arg.Any<object>(), Arg.Any<CancellationToken>())
            .Throws(new EventAlreadyHandledException());
        
        var fakeEventFactory = Substitute.For<IEventFactory>();
        fakeEventFactory
            .CreateEvent(Arg.Any<string>(), Arg.Any<StringValues>())
            .Returns(new Event()
            {
                Data = new EventData()
            });

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new ()
        {
            IocConfiguration = services =>
            {
                services.RemoveAll<IStripeEventHandler>();
                
                services.AddSingleton(fakeHandler);

                services.AddSingleton(fakeEventFactory);
            }
        });

        var handler = environment.ServiceProvider.GetRequiredService<StripeWebhookPost>();
        handler.EnsureControllerContext();
        handler.Request.Headers.Add("Stripe-Signature", "some-signature");
            
        //Act
        var result = await handler.HandleAsync();

        //Assert
        Assert.IsTrue(result is OkObjectResult { Value: "Already handled." });
    }
}