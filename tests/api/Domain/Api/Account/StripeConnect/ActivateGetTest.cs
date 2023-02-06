using System;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Controllers.Api.Account.StripeConnect.Activate;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Account.StripeConnect;

[TestClass]
public class ActivateGetTest
{
    [TestMethod]
    public async Task HandleAsync_MultipleUsersExist_CreatesLinkForSignedInUserConnectId()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder
                .WithAccount(environment.Stripe.AccountBuilder))
            .BuildAsync();

        var handler = environment.ScopeProvider.GetRequiredService<ActivateGet>();
        handler.FakeAuthentication(user.Id);

        var broadcastId = Guid.NewGuid();
        
        //Act
        var result = await handler.HandleAsync(new Request(broadcastId));
            
        //Assert
        Assert.IsNotNull(result.ToResponseObject().Url);
    }
}