using System;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Controllers.Api.Account.StripeConnect.Setup;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Builders.Database;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Account.StripeConnect;

[TestClass]
public class SetupPostTest
{
    [TestMethod]
    public async Task HandleAsync_NoExistingStripeConnectAccountFound_CreatesNewStripeConnectAccount()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder)
            .BuildAsync();

        Assert.IsNull(user.StripeConnectId);

        var handler = environment.ServiceProvider.GetRequiredService<SetupPost>();
        handler.FakeAuthentication(user);

        //Act
        await handler.HandleAsync(new Request(Guid.NewGuid()));
            
        //Assert
        Assert.IsNotNull(user.StripeConnectId);
        
        var stripeAccount = await environment.Stripe.AccountService.GetAsync(user.StripeConnectId);
        Assert.IsNotNull(stripeAccount);
    }
        
    [TestMethod]
    public async Task HandleAsync_NoExistingStripeConnectAccountFound_PersistsCreatedStripeConnectAccountToUserInDatabase()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder)
            .BuildAsync();

        Assert.IsNull(user.StripeConnectId);

        var handler = environment.ServiceProvider.GetRequiredService<SetupPost>();
        handler.FakeAuthentication(user);

        //Act
        await handler.HandleAsync(new Request(Guid.NewGuid()));
            
        //Assert
        Assert.IsNotNull(user.StripeConnectId);

        var userFromDatabase = await environment.Database.WithoutCachingAsync(async context => 
            await context.Users.FindAsync(user.Id));
        Assert.IsNotNull(userFromDatabase);
    }
        
    [TestMethod]
    public async Task HandleAsync_CancellationSignaledBeforeStripeConnectAccountCreation_DoesNotCancelStripeAccountCreation()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_CancellationSignaledBeforeStripeConnectAccountCreation_DoesNotCancelUserDatabaseUpdate()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}