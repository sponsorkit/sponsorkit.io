using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Controllers.Api.Account;
using Sponsorkit.Domain.Models.Stripe;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Builders.Database;
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

        //Act

        //Assert
        Assert.Fail("Not implemented.");
    }

    [TestMethod]
    public async Task HandleAsync_GitHubInformationPresentOnAccount_ResponseIncludesGitHubUsername()
    {
        //Arrange

        //Act

        //Assert
        Assert.Fail("Not implemented.");
    }

    [TestMethod]
    public async Task HandleAsync_EmailVerified_EmailVerifiedInResponse()
    {
        //Arrange

        //Act

        //Assert
        Assert.Fail("Not implemented.");
    }

    [TestMethod]
    public async Task HandleAsync_EmailNotVerified_EmailNotVerifiedInResponse()
    {
        //Arrange

        //Act

        //Assert
        Assert.Fail("Not implemented.");
    }

    [TestMethod]
    public async Task HandleAsync_NoStripeConnectAccountReferencePresentOnUser_ReturnsNullBeneficiaryResponse()
    {
        //Arrange

        //Act

        //Assert
        Assert.Fail("Not implemented.");
    }

    [TestMethod]
    public async Task HandleAsync_ExistingStripeConnectAccountReferenceWithDetailsSubmittedPresentOnUser_ReturnsIsCompleted()
    {
        //Arrange

        //Act

        //Assert
        Assert.Fail("Not implemented.");
    }

    [TestMethod]
    public async Task HandleAsync_ExistingStripeConnectAccountReferenceWithNoDetailsSubmittedPresentOnUser_ReturnsIsNotCompleted()
    {
        //Arrange

        //Act

        //Assert
        Assert.Fail("Not implemented.");
    }
}