using System.Linq;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.BusinessLogic.Domain.Mediatr.GitHub;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;

namespace Sponsorkit.Tests.BusinessLogic.Domain.Mediatr;

[TestClass]
public class UpsertIssueCommentCommandTest
{
    [TestMethod]
    public async Task Handle_OwnerDifferentThanSponsorkitOnDevelopmentEnvironment_DoesNothing()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var issue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();
        
        //Act
        await environment.Mediator.Send(
            new UpsertIssueCommentCommand(
                "some-non-sponsorkit-owner",
                GitHubTestConstants.RepositoryName,
                issue.Id,
                "body"));
            
        //Assert
        var comments = await environment.GitHub.BountyhuntBot.RestClient.Issue.Comment.GetAllForIssue(
            GitHubTestConstants.RepositoryOwnerName,
            GitHubTestConstants.RepositoryName,
            issue.Number);
        Assert.AreEqual(0, comments.Count);
    }
    
    [TestMethod]
    public async Task Handle_RepositoryNameDifferentThanPlaygroundOnDevelopmentEnvironment_DoesNothing()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var issue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();
        
        //Act
        await environment.Mediator.Send(
            new UpsertIssueCommentCommand(
                GitHubTestConstants.RepositoryOwnerName,
                "some-non-sponsorkit-repository-name",
                issue.Id,
                "body"));
            
        //Assert
        var comments = await environment.GitHub.BountyhuntBot.RestClient.Issue.Comment.GetAllForIssue(
            GitHubTestConstants.RepositoryOwnerName,
            GitHubTestConstants.RepositoryName,
            issue.Number);
        Assert.AreEqual(0, comments.Count);
    }
        
    [TestMethod]
    public async Task Handle_ExistingBotCommentFound_UpdatesExistingComment()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var issue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();
        await environment.GitHub.BountyhuntBot.RestClient.Issue.Comment.Create(
            GitHubTestConstants.RepositoryOwnerName,
            GitHubTestConstants.RepositoryName,
            issue.Number,
            "old-body");

        //Act
        await environment.Mediator.Send(
            new UpsertIssueCommentCommand(
                GitHubTestConstants.RepositoryOwnerName,
                GitHubTestConstants.RepositoryName,
                issue.Number,
                "new-body"));
            
        //Assert
        var comments = await environment.GitHub.BountyhuntBot.RestClient.Issue.Comment.GetAllForIssue(
            GitHubTestConstants.RepositoryOwnerName,
            GitHubTestConstants.RepositoryName,
            issue.Number);
        Assert.AreEqual(1, comments.Count);
        Assert.AreEqual(
            GetDisclaimerPrefixedText("new-body"), 
            comments.Single().Body);
    }

    [TestMethod]
    public async Task Handle_NoExistingBotCommentFound_CreatesNewComment()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var issue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();

        //Act
        await environment.Mediator.Send(
            new UpsertIssueCommentCommand(
                GitHubTestConstants.RepositoryOwnerName,
                GitHubTestConstants.RepositoryName,
                issue.Number,
                "body"));
            
        //Assert
        var comments = await environment.GitHub.BountyhuntBot.RestClient.Issue.Comment.GetAllForIssue(
            GitHubTestConstants.RepositoryOwnerName,
            GitHubTestConstants.RepositoryName,
            issue.Number);
        Assert.AreEqual(1, comments.Count);
        Assert.AreEqual(
            GetDisclaimerPrefixedText("body"), 
            comments.Single().Body);
    }

    private static string GetDisclaimerPrefixedText(string text)
    {
        return $"""
            <b>Warning:</b> This comment was posted with a dev version of Bountyhunt. This means that any bounties offered here are not real bounties that can be claimed with a production account.

            {text}
            """.Trim(); 
    }
}