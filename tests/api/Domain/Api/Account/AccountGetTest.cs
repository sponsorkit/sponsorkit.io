using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Api.Domain.Controllers.Api.Account;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Account;

[TestClass]
public class AccountGetTest
{
    [TestMethod]
    public async Task HandleAsync_StripeCustomerNotPresent_ThrowsException()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder.BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<AccountGet>();
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

    [TestMethod]
    public async Task HandleAsync_EmailPresentOnAccount_ResponseIncludesEmail()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder
            .WithEmail("some-email@example.com")
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<AccountGet>();
        handler.FakeAuthentication(user.Id);

        //Act
        var result = await handler.HandleAsync();

        //Assert
        var response = result.ToResponseObject();
        Assert.AreEqual("some-email@example.com", response.Email);
    }

    [TestMethod]
    public async Task HandleAsync_GitHubInformationPresentOnAccount_ResponseIncludesGitHubUsername()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder
            .WithGitHub(
                1337,
                "some-username",
                "some-access-token")
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<AccountGet>();
        handler.FakeAuthentication(user.Id);

        //Act
        var result = await handler.HandleAsync();

        //Assert
        var response = result.ToResponseObject();
        Assert.AreEqual("some-username", response.GitHubUsername);
    }

    [TestMethod]
    public async Task HandleAsync_EmailVerified_EmailVerifiedInResponse()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder
            .WithVerifiedEmail()
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<AccountGet>();
        handler.FakeAuthentication(user.Id);

        //Act
        var result = await handler.HandleAsync();

        //Assert
        var response = result.ToResponseObject();
        Assert.AreEqual(true, response.IsEmailVerified);
    }

    [TestMethod]
    public async Task HandleAsync_EmailNotVerified_EmailNotVerifiedInResponse()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<AccountGet>();
        handler.FakeAuthentication(user.Id);

        //Act
        var result = await handler.HandleAsync();

        //Assert
        var response = result.ToResponseObject();
        Assert.AreEqual(false, response.IsEmailVerified);
    }

    [TestMethod]
    public async Task HandleAsync_NoStripeConnectAccountReferencePresentOnUser_ReturnsNullBeneficiaryResponse()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder)
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<AccountGet>();
        handler.FakeAuthentication(user.Id);

        //Act
        var result = await handler.HandleAsync();

        //Assert
        var response = result.ToResponseObject();
        Assert.IsNull(response.Beneficiary);
    }

    [TestMethod]
    public async Task HandleAsync_ExistingStripeConnectAccountReferenceWithDetailsSubmittedPresentOnUser_ReturnsIsCompleted()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder
                .WithAccount(environment.Stripe.AccountBuilder
                    .WithDetailsSubmitted()))
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<AccountGet>();
        handler.FakeAuthentication(user.Id);

        //Act
        var result = await handler.HandleAsync();

        //Assert
        var response = result.ToResponseObject();
        Assert.IsTrue(response.Beneficiary.IsAccountComplete);
    }

    [TestMethod]
    public async Task HandleAsync_ExistingStripeConnectAccountReferenceWithNoDetailsSubmittedPresentOnUser_ReturnsIsNotCompleted()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder
            .WithStripeCustomer(environment.Stripe.CustomerBuilder
                .WithAccount(environment.Stripe.AccountBuilder))
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<AccountGet>();
        handler.FakeAuthentication(user.Id);

        //Act
        var result = await handler.HandleAsync();

        //Assert
        var response = result.ToResponseObject();
        Assert.IsFalse(response.Beneficiary.IsAccountComplete);
    }
}