﻿using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Sponsorkit.BusinessLogic.Infrastructure.Stripe;
using Sponsorkit.Domain.Controllers.Api.Bounties.SetupIntent;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;

namespace Sponsorkit.Tests.Domain.Api.Bounties.SetupIntent;

[TestClass]
public class SetupIntentPostTest
{
    [TestMethod]
    public async Task HandleAsync_GitHubIssueOrRepositoryNotFound_ReturnsNotFound()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var handler = environment.ServiceProvider.GetRequiredService<SetupIntentPost>();

        //Act
        var result = await handler.HandleAsync(new(
            new GitHubIssueRequest("owner-name", "repo-name", 1337),
            10_00));

        //Assert
        Assert.IsTrue(result.Result is NotFoundObjectResult { Value: "Issue or repository was not found." });
    }

    [TestMethod]
    public async Task HandleAsync_AmountBelowMinimumAmount_ReturnsBadRequest()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();
        
        var fakeGitHubClient = environment.GitHub.FakeClient;
        fakeGitHubClient.Issue
            .Get("owner-name", "repo-name", 1337)
            .Returns(new TestIssue());
        
        fakeGitHubClient.Repository
            .Get("owner-name", "repo-name")
            .Returns(new TestRepository());

        var handler = environment.ServiceProvider.GetRequiredService<SetupIntentPost>();

        //Act
        var result = await handler.HandleAsync(new(
            new GitHubIssueRequest("owner-name", "repo-name", 1337),
            Constants.MinimumBountyAmountInHundreds - 0_01));

        //Assert
        Assert.IsTrue(result.Result is BadRequestObjectResult { Value: "Minimum amount is 10 USD." });
    }

    [TestMethod]
    public async Task HandleAsync_PaymentMethodPresent_ReturnsCreatedSetupIntent()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();
        
        var fakeGitHubClient = environment.GitHub.FakeClient;
        fakeGitHubClient.Issue
            .Get("owner-name", "repo-name", 1337)
            .Returns(new TestIssue());
        
        fakeGitHubClient.Repository
            .Get("owner-name", "repo-name")
            .Returns(new TestRepository());

        var handler = environment.ServiceProvider.GetRequiredService<SetupIntentPost>();

        //Act
        var result = await handler.HandleAsync(new(
            new GitHubIssueRequest("owner-name", "repo-name", 1337),
            Constants.MinimumBountyAmountInHundreds - 0_01));

        //Assert
        Assert.IsTrue(result.Result is BadRequestObjectResult { Value: "Minimum amount is 10 USD." });
    }
}