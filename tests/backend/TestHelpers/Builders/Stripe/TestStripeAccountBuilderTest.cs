using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.TestHelpers.Builders.Stripe;

[TestClass]
public class TestStripeAccountBuilderTest
{
    [TestMethod]
    public async Task BuildAsync_AccountVerified_SubmitsRequiredInformation()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder.BuildAsync();

        var customer = await environment.Stripe.CustomerBuilder
            .WithUser(user)
            .BuildAsync();

        //Act
        var testAccount = await environment.Stripe.AccountBuilder
            .WithDetailsSubmitted()
            .WithCustomerId(customer.Id)
            .BuildAsync();

        //Assert
        Assert.IsTrue(testAccount.DetailsSubmitted);
    }
}