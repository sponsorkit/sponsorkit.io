using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Api.Domain.Controllers.Api.Bounties.SetupIntent;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Api.Domain.Controllers.Bounties.SetupIntent;

[TestClass]
public class SetupIntentGetTest
{
    [TestMethod]
    public async Task HandleAsync_PaymentNotFound_ReturnsFalse()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<SetupIntentGet>();
        handler.FakeAuthentication(authenticatedUser);
            
        //Act
        var result = await handler.HandleAsync(
            new GetRequest("intent-id"));
            
        //Assert
        var response = result.ToResponseObject();
        Assert.IsFalse(response.IsProcessed);
    }
        
    [TestMethod]
    public async Task HandleAsync_PaymentFoundButNotCreatedByBountyCreator_ReturnsFalse()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();

        var otherUser = await environment.Database.UserBuilder.BuildAsync();

        var bounty = await environment.Database.BountyBuilder
            .WithCreator(otherUser)
            .BuildAsync();
        
        var payment = await environment.Database.PaymentBuilder
            .WithStripeId("some-stripe-id")
            .WithBounty(bounty)
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<SetupIntentGet>();
        handler.FakeAuthentication(authenticatedUser);
            
        //Act
        var result = await handler.HandleAsync(
            new GetRequest(payment.StripeId));
            
        //Assert
        var response = result.ToResponseObject();
        Assert.IsFalse(response.IsProcessed);
    }
        
    [TestMethod]
    public async Task HandleAsync_PaymentFound_ReturnsTrue()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();

        var bounty = await environment.Database.BountyBuilder
            .WithCreator(authenticatedUser)
            .BuildAsync();
        
        var payment = await environment.Database.PaymentBuilder
            .WithStripeId("some-stripe-id")
            .WithBounty(bounty)
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<SetupIntentGet>();
        handler.FakeAuthentication(authenticatedUser);
            
        //Act
        var result = await handler.HandleAsync(
            new GetRequest(payment.StripeId));
            
        //Assert
        var response = result.ToResponseObject();
        Assert.IsTrue(response.IsProcessed);
    }
}