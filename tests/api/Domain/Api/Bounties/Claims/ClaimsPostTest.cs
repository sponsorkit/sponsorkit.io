using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Octokit;
using Sponsorkit.Domain.Controllers.Api.Bounties.Claims;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Bounties.Claims;

[TestClass]
public class ClaimsPostTest
{
    [TestMethod]
    public async Task HandleAsync_IssueNotFound_ReturnsNotFound()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var handler = environment.ServiceProvider.GetRequiredService<ClaimsPost>();

        //Act
        var result = await handler.HandleAsync(new PostRequest(1337, 1337));
            
        //Assert
        Assert.IsTrue(result is NotFoundObjectResult { Value: "Issue not found." });
    }
        
    [TestMethod]
    public async Task HandleAsync_PullRequestNotFound_ReturnsNotFound()
    {
        //Arrange
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new ()
        {
            IocConfiguration = services => services.AddSingleton(fakeGitHubClient)
        });

        var pullRequestNumber = 13371337;

        var gitHubIssue = await environment.Database.IssueBuilder
            .WithRepository(await environment.Database.RepositoryBuilder.BuildAsync())
            .BuildAsync();

        fakeGitHubClient.PullRequest
            .Get(
                gitHubIssue.Repository.GitHub.Id,
                pullRequestNumber)
            .Returns((PullRequest)null);

        var handler = environment.ServiceProvider.GetRequiredService<ClaimsPost>();

        //Act
        var result = await handler.HandleAsync(new PostRequest(gitHubIssue.GitHub.Id, pullRequestNumber));
            
        //Assert
        Assert.IsTrue(result is NotFoundObjectResult { Value: "Invalid pull request specified." });
    }
        
    [TestMethod]
    public async Task HandleAsync_ClaimerDoesNotOwnGivenPullRequest_ReturnsUnauthorized()
    {
        //Arrange
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new ()
        {
            IocConfiguration = services => services.AddSingleton(fakeGitHubClient)
        });

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();

        var gitHubIssue = await environment.Database.IssueBuilder
            .WithRepository(await environment.Database.RepositoryBuilder.BuildAsync())
            .BuildAsync();

        var pullRequest = await environment.GitHub.PullRequest.BuildAsync();
        
        fakeGitHubClient.PullRequest
            .Get(
                gitHubIssue.Repository.GitHub.Id,
                pullRequest.Number)
            .Returns(pullRequest);

        var handler = environment.ServiceProvider.GetRequiredService<ClaimsPost>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        var result = await handler.HandleAsync(new PostRequest(
            gitHubIssue.GitHub.Id, 
            pullRequest.Number));
            
        //Assert
        Assert.IsTrue(result is NotFoundObjectResult { Value: "The given pull request is not owned by the claimer." });
    }
        
    [TestMethod]
    public async Task HandleAsync_ClaimAlreadyExistsForIssue_ReturnsBadRequest()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_ErrorDuringSecondClaimRequestCreation_RollsBackFirstClaimRequestCreation()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_MultipleClaimRequestsCreated_EmailsAreSentOutToBountyCreators()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}