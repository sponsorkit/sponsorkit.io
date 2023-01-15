using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Controllers.Api.Bounties.Claims;
using Sponsorkit.Domain.Controllers.Api.Bounties.GitHubIssueId;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Bounties.GitHubIssueId;

[TestClass]
public class BountiesGitHubIssueIdGetTest
{
    [TestMethod]
    public async Task HandleAsync_IssueNotFound_ReturnsNotFound()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var handler = environment.ServiceProvider.GetRequiredService<BountiesGitHubIssueIdGet>();
            
        //Act
        var response = await handler.HandleAsync(
            new GetRequest(1337));
            
        //Assert
        Assert.IsInstanceOfType<NotFoundResult>(response.Result);
    }
        
    [TestMethod]
    public async Task HandleAsync_IssueFound_ReturnsResponse()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var issue = await environment.Database.IssueBuilder.BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<BountiesGitHubIssueIdGet>();
            
        //Act
        var response = await handler.HandleAsync(
            new GetRequest(issue.GitHub.Id));
            
        //Assert
        var result = response.ToResponseObject();
        Assert.IsNotNull(result);
    }
        
    [TestMethod]
    public async Task HandleAsync_MultipleIssuesWithPayments_ReturnsResponseWithSumOfPaymentAmounts()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        
        var issue = await environment.Database.IssueBuilder.BuildAsync();
        
        var bounty1 = await environment.Database.BountyBuilder
            .WithIssue(issue)
            .BuildAsync();
        var payment1 = await environment.Database.PaymentBuilder
            .WithAmount(10_00, 1_00)
            .WithBounty(bounty1)
            .BuildAsync();
        
        var bounty2 = await environment.Database.BountyBuilder
            .WithIssue(issue)
            .BuildAsync();
        var payment2 = await environment.Database.PaymentBuilder
            .WithAmount(15_00, 1_00)
            .WithBounty(bounty2)
            .BuildAsync();;

            
        var handler = environment.ServiceProvider.GetRequiredService<BountiesGitHubIssueIdGet>();
            
        //Act
        var response = await handler.HandleAsync(
            new GetRequest(issue.GitHub.Id));
            
        //Assert
        var result = response.ToResponseObject();
        Assert.AreEqual(10_00, result.Bounties[0].AmountInHundreds);
        Assert.AreEqual(15_00, result.Bounties[1].AmountInHundreds);
    }
}