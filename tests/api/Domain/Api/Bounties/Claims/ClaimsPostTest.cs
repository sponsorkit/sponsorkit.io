using System.Threading;
using System.Threading.Tasks;
using Amazon.SimpleEmailV2.Model;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.Domain.Controllers.Api.Bounties.Claims;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;
using PullRequest = Octokit.PullRequest;

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
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var pullRequestNumber = 13371337;

        var gitHubIssue = await environment.Database.IssueBuilder
            .WithRepository(await environment.Database.RepositoryBuilder.BuildAsync())
            .BuildAsync();

        var fakeGitHubClient = environment.GitHub.FakeClient;
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
    public async Task HandleAsync_ClaimerDoesNotHaveGitHubAccount_ReturnsUnauthorized()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder
            .WithoutGitHub()
            .BuildAsync();

        var gitHubIssue = await environment.Database.IssueBuilder
            .WithRepository(await environment.Database.RepositoryBuilder.BuildAsync())
            .BuildAsync();

        var pullRequest = await environment.GitHub.PullRequest.BuildAsync();

        var fakeGitHubClient = environment.GitHub.FakeClient;
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
        Assert.IsTrue(result is UnauthorizedObjectResult { Value: "User must be linked to GitHub." });
    }

    [TestMethod]
    public async Task HandleAsync_ClaimerDoesNotOwnGivenPullRequest_ReturnsUnauthorized()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder
            .WithGitHub(1337, "test", "test")
            .BuildAsync();

        var gitHubIssue = await environment.Database.IssueBuilder
            .WithRepository(await environment.Database.RepositoryBuilder.BuildAsync())
            .BuildAsync();

        var pullRequest = await environment.GitHub.PullRequest.BuildAsync();

        var fakeGitHubClient = environment.GitHub.FakeClient;
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
        Assert.IsTrue(result is UnauthorizedObjectResult { Value: "The given pull request is not owned by the claimer." });
    }

    [TestMethod]
    public async Task HandleAsync_ClaimAlreadyExistsForIssue_ReturnsBadRequest()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder
            .WithGitHub(1337, "test", "test")
            .BuildAsync();

        var repository = await environment.Database.RepositoryBuilder.BuildAsync();

        var issue = await environment.Database.IssueBuilder
            .WithRepository(repository)
            .BuildAsync();

        var gitHubPullRequest = await environment.GitHub.PullRequest
            .WithUser(new TestGitHubUser()
            {
                Id = (int)authenticatedUser.GitHub.Id
            })
            .BuildAsync();
        var pullRequest = await environment.Database.PullRequestBuilder
            .WithGitHubInformation(gitHubPullRequest.Id, gitHubPullRequest.Number)
            .WithRepository(repository)
            .BuildAsync();

        var bounty = await environment.Database.BountyBuilder
            .WithIssue(issue)
            .WithCreator(authenticatedUser)
            .BuildAsync();

        var authenticatedUserClaimRequest = await environment.Database.BountyClaimRequestBuilder
            .WithCreator(authenticatedUser)
            .WithPullRequest(pullRequest)
            .WithBounty(bounty)
            .BuildAsync();

        var fakeGitHubClient = environment.GitHub.FakeClient;
        fakeGitHubClient.PullRequest
            .Get(
                issue.Repository.GitHub.Id,
                gitHubPullRequest.Number)
            .Returns(gitHubPullRequest);

        var handler = environment.ServiceProvider.GetRequiredService<ClaimsPost>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        var result = await handler.HandleAsync(new PostRequest(
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
            .WithGitHub(1337, "test1", "test1")
            .BuildAsync();

        var otherUser = await environment.Database.UserBuilder
            .WithGitHub(1338, "test2", "test2")
            .BuildAsync();

        var repository = await environment.Database.RepositoryBuilder.BuildAsync();

        var issue = await environment.Database.IssueBuilder
            .WithRepository(repository)
            .BuildAsync();

        var gitHubPullRequest = await environment.GitHub.PullRequest
            .WithUser(new TestGitHubUser()
            {
                Id = (int)authenticatedUser.GitHub!.Id
            })
            .BuildAsync();
        var pullRequest = await environment.Database.PullRequestBuilder
            .WithGitHubInformation(gitHubPullRequest.Id, gitHubPullRequest.Number)
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

        var fakeGitHubClient = environment.GitHub.FakeClient;
        fakeGitHubClient.PullRequest
            .Get(
                issue.Repository.GitHub.Id,
                gitHubPullRequest.Number)
            .Returns(gitHubPullRequest);

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
            await handler.HandleAsync(new PostRequest(
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
            .WithGitHub(1337, "test1", "test1")
            .BuildAsync();

        var otherUser = await environment.Database.UserBuilder
            .WithGitHub(1338, "test2", "test2")
            .BuildAsync();

        var repository = await environment.Database.RepositoryBuilder.BuildAsync();

        var issue = await environment.Database.IssueBuilder
            .WithRepository(repository)
            .BuildAsync();

        var gitHubPullRequest = await environment.GitHub.PullRequest
            .WithUser(new TestGitHubUser()
            {
                Id = (int)authenticatedUser.GitHub.Id
            })
            .BuildAsync();
        var pullRequest = await environment.Database.PullRequestBuilder
            .WithGitHubInformation(gitHubPullRequest.Id, gitHubPullRequest.Number)
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

        var fakeGitHubClient = environment.GitHub.FakeClient;
        fakeGitHubClient.PullRequest
            .Get(
                issue.Repository.GitHub.Id,
                gitHubPullRequest.Number)
            .Returns(gitHubPullRequest);

        var handler = environment.ServiceProvider.GetRequiredService<ClaimsPost>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        await handler.HandleAsync(new PostRequest(
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
            .WithGitHub(1337, "test1", "test1")
            .BuildAsync();

        var otherUser = await environment.Database.UserBuilder
            .WithGitHub(1338, "test2", "test2")
            .BuildAsync();

        var repository = await environment.Database.RepositoryBuilder.BuildAsync();

        var issue = await environment.Database.IssueBuilder
            .WithRepository(repository)
            .BuildAsync();

        var gitHubPullRequest = await environment.GitHub.PullRequest
            .WithUser(new TestGitHubUser()
            {
                Id = (int)authenticatedUser.GitHub.Id
            })
            .BuildAsync();
        var pullRequest = await environment.Database.PullRequestBuilder
            .WithGitHubInformation(gitHubPullRequest.Id, gitHubPullRequest.Number)
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

        var fakeGitHubClient = environment.GitHub.FakeClient;
        fakeGitHubClient.PullRequest
            .Get(
                issue.Repository.GitHub.Id,
                gitHubPullRequest.Number)
            .Returns(gitHubPullRequest);

        var handler = environment.ServiceProvider.GetRequiredService<ClaimsPost>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        await handler.HandleAsync(new PostRequest(
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