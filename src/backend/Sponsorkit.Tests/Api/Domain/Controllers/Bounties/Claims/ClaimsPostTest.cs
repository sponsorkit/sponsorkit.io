using System.Threading;
using System.Threading.Tasks;
using Amazon.SimpleEmailV2.Model;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Sponsorkit.Api.Domain.Controllers.Api.Bounties.Claims;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Builders.Database;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Api.Domain.Controllers.Bounties.Claims;

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
        var result = await handler.HandleAsync(new ClaimsRequest(1337, 1337));

        //Assert
        Assert.IsTrue(result is NotFoundObjectResult { Value: "Issue not found." });
    }

    [TestMethod]
    public async Task HandleAsync_PullRequestNotFound_ReturnsNotFound()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var repository = await environment.Database.RepositoryBuilder.BuildAsync();

        var gitHubIssue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();

        var issue = await environment.Database.IssueBuilder
            .WithRepository(repository)
            .WithGitHubInformation(
                gitHubIssue.Id,
                gitHubIssue.Number,
                gitHubIssue.Title)
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<ClaimsPost>();

        //Act
        var result = await handler.HandleAsync(new ClaimsRequest(
            issue.GitHub.Id, 
            13371337));

        //Assert
        Assert.IsTrue(result is NotFoundObjectResult { Value: "Invalid pull request specified." });
    }

    [TestMethod]
    public async Task HandleAsync_ClaimerDoesNotHaveGitHubAccount_ReturnsUnauthorized()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder
            .WithoutGitHub()
            .BuildAsync();

        var repository = await environment.Database.RepositoryBuilder.BuildAsync();

        var gitHubIssue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();

        var issue = await environment.Database.IssueBuilder
            .WithRepository(repository)
            .WithGitHubInformation(
                gitHubIssue.Id,
                gitHubIssue.Number,
                gitHubIssue.Title)
            .BuildAsync();

        var pullRequest = await environment.GitHub.BountyhuntBot.PullRequestBuilder.BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<ClaimsPost>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        var result = await handler.HandleAsync(new ClaimsRequest(
            issue.GitHub.Id,
            pullRequest.Number));

        //Assert
        Assert.IsTrue(result is UnauthorizedObjectResult { Value: "User must be linked to GitHub." });
    }

    [TestMethod]
    public async Task HandleAsync_ClaimerDoesNotOwnGivenPullRequest_ReturnsUnauthorized()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();

        var repository = await environment.Database.RepositoryBuilder.BuildAsync();

        var gitHubIssue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();

        var issue = await environment.Database.IssueBuilder
            .WithRepository(repository)
            .WithGitHubInformation(
                gitHubIssue.Id,
                gitHubIssue.Number,
                gitHubIssue.Title)
            .BuildAsync();

        var pullRequest = await environment.GitHub.SponsorkitBot.PullRequestBuilder.BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<ClaimsPost>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        var result = await handler.HandleAsync(new ClaimsRequest(
            issue.GitHub.Id,
            pullRequest.Number));

        //Assert
        Assert.IsTrue(result is UnauthorizedObjectResult { Value: "The given pull request is not owned by the claimer." });
    }

    [TestMethod]
    public async Task HandleAsync_ClaimAlreadyExistsForIssue_ReturnsBadRequest()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();

        var repository = await environment.Database.RepositoryBuilder.BuildAsync();

        var gitHubIssue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();

        var issue = await environment.Database.IssueBuilder
            .WithRepository(repository)
            .WithGitHubInformation(
                gitHubIssue.Id,
                gitHubIssue.Number,
                gitHubIssue.Title)
            .BuildAsync();

        var bounty = await environment.Database.BountyBuilder
            .WithIssue(issue)
            .WithCreator(authenticatedUser)
            .BuildAsync();

        var gitHubPullRequest = await environment.GitHub.BountyhuntBot.PullRequestBuilder.BuildAsync();
        
        var pullRequest = await environment.Database.PullRequestBuilder
            .WithGitHubInformation(gitHubPullRequest.Id, gitHubPullRequest.Number)
            .WithRepository(repository)
            .BuildAsync();

        var authenticatedUserClaimRequest = await environment.Database.BountyClaimRequestBuilder
            .WithCreator(authenticatedUser)
            .WithPullRequest(pullRequest)
            .WithBounty(bounty)
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<ClaimsPost>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        var result = await handler.HandleAsync(new ClaimsRequest(
            issue.GitHub.Id,
            gitHubPullRequest.Number));

        //Assert
        Assert.IsTrue(result is BadRequestObjectResult { Value: "An existing claim request exists for this bounty." });
    }

    [TestMethod]
    public async Task HandleAsync_ErrorDuringSecondClaimRequestCreation_RollsBackFirstClaimRequestCreation()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder
            .WithGitHub(GitHubUserType.SponsorkitBot)
            .BuildAsync();

        var otherUser = await environment.Database.UserBuilder
            .WithGitHub(GitHubUserType.BountyhuntBot)
            .BuildAsync();

        var repository = await environment.Database.RepositoryBuilder.BuildAsync();

        var gitHubIssue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();

        var issue = await environment.Database.IssueBuilder
            .WithRepository(repository)
            .WithGitHubInformation(
                gitHubIssue.Id,
                gitHubIssue.Number,
                gitHubIssue.Title)
            .BuildAsync();

        var bounty1 = await environment.Database.BountyBuilder
            .WithIssue(issue)
            .WithCreator(authenticatedUser)
            .BuildAsync();

        var bounty2 = await environment.Database.BountyBuilder
            .WithIssue(issue)
            .WithCreator(otherUser)
            .BuildAsync();

        var gitHubPullRequest = await environment.GitHub.BountyhuntBot.PullRequestBuilder.BuildAsync();
        
        var pullRequest = await environment.Database.PullRequestBuilder
            .WithGitHubInformation(gitHubPullRequest.Id, gitHubPullRequest.Number)
            .WithRepository(repository)
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<ClaimsPost>();
        handler.FakeAuthentication(authenticatedUser);

        var amountOfBountyClaimsRequestsAdded = 0;
        environment.Database.Context.OnEntityAdded<BountyClaimRequest>(() =>
        {
            if (++amountOfBountyClaimsRequestsAdded == 2)
                throw new TestException();
        });

        //Act
        var exception = await Assert.ThrowsExceptionAsync<TestException>(async () =>
            await handler.HandleAsync(new ClaimsRequest(
                issue.GitHub.Id,
                gitHubPullRequest.Number)));

        //Assert
        Assert.IsNotNull(exception);
        Assert.AreEqual(2, amountOfBountyClaimsRequestsAdded);

        var claimRequests = await environment.Database.Context.BountyClaimRequests.ToListAsync();
        Assert.AreEqual(0, claimRequests.Count);
    }

    [TestMethod]
    public async Task HandleAsync_MultipleBountiesForIssue_CreatesClaimRequestsForAllBounties()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder
            .WithGitHub(GitHubUserType.SponsorkitBot)
            .BuildAsync();

        var otherUser = await environment.Database.UserBuilder
            .WithGitHub(GitHubUserType.BountyhuntBot)
            .BuildAsync();

        var repository = await environment.Database.RepositoryBuilder.BuildAsync();

        var issue = await environment.Database.IssueBuilder
            .WithRepository(repository)
            .BuildAsync();

        var bounty1 = await environment.Database.BountyBuilder
            .WithIssue(issue)
            .WithCreator(authenticatedUser)
            .BuildAsync();

        var bounty2 = await environment.Database.BountyBuilder
            .WithIssue(issue)
            .WithCreator(otherUser)
            .BuildAsync();

        var gitHubPullRequest = await environment.GitHub.BountyhuntBot.PullRequestBuilder.BuildAsync();
        
        var pullRequest = await environment.Database.PullRequestBuilder
            .WithGitHubInformation(gitHubPullRequest.Id, gitHubPullRequest.Number)
            .WithRepository(repository)
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<ClaimsPost>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        await handler.HandleAsync(new ClaimsRequest(
            issue.GitHub.Id,
            gitHubPullRequest.Number));

        //Assert
        var claimRequests = await environment.Database.Context.BountyClaimRequests.ToListAsync();
        Assert.AreEqual(2, claimRequests.Count);
    }

    [TestMethod]
    public async Task HandleAsync_MultipleClaimRequestsCreated_EmailsAreSentOutToBountyCreators()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder
            .WithGitHub(GitHubUserType.SponsorkitBot)
            .BuildAsync();

        var otherUser = await environment.Database.UserBuilder
            .WithGitHub(GitHubUserType.BountyhuntBot)
            .BuildAsync();

        var repository = await environment.Database.RepositoryBuilder.BuildAsync();

        var issue = await environment.Database.IssueBuilder
            .WithRepository(repository)
            .BuildAsync();

        var bounty1 = await environment.Database.BountyBuilder
            .WithIssue(issue)
            .WithCreator(authenticatedUser)
            .BuildAsync();

        var bounty2 = await environment.Database.BountyBuilder
            .WithIssue(issue)
            .WithCreator(otherUser)
            .BuildAsync();
        
        var gitHubPullRequest = await environment.GitHub.BountyhuntBot.PullRequestBuilder.BuildAsync();

        var pullRequest = await environment.Database.PullRequestBuilder
            .WithGitHubInformation(gitHubPullRequest.Id, gitHubPullRequest.Number)
            .WithRepository(repository)
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<ClaimsPost>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        await handler.HandleAsync(new ClaimsRequest(
            issue.GitHub.Id,
            gitHubPullRequest.Number));

        //Assert
        await environment.Email.FakeEmailService
            .Received(2)
            .SendEmailAsync(
                Arg.Is<SendEmailRequest>(request => request.Content.Simple.Subject.Data == "Someone wants to claim your bounty"),
                Arg.Any<CancellationToken>());
    }
}