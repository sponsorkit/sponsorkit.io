using System.Linq;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.BusinessLogic.Domain.Mediatr.GitHub;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.BusinessLogic.Domain.Mediatr;

[TestClass]
public class UpsertIssueCommentCommandTest
{
    [TestMethod]
    public async Task Handle_OwnerDifferentThanSponsorkitOnDevelopmentEnvironment_DoesNothing()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var issue = await environment.GitHub.IssueBuilder.BuildAsync();
            
        //Act
        await environment.Mediator.Send(
            new UpsertIssueCommentCommand(
                issue.Repository.Owner.Name,
                issue.Repository.Name,
                issue.Id,
                "body"));
            
        //Assert
        var comments = await environment.GitHub.RestClient.Issue.Comment.GetAllForIssue(
            issue.Repository.Owner.Name,
            issue.Repository.Name,
            issue.Number);
        Assert.AreEqual(0, comments.Count);
    }
        
    [TestMethod]
    public async Task Handle_ExistingBotCommentFound_UpdatesExistingComment()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var issue = await environment.GitHub.IssueBuilder.BuildAsync();
        await environment.GitHub.RestClient.Issue.Comment.Create(
            issue.Repository.Owner.Name,
            issue.Repository.Name,
            issue.Number,
            "old-body");

        //Act
        await environment.Mediator.Send(
            new UpsertIssueCommentCommand(
                issue.Repository.Owner.Name,
                issue.Repository.Name,
                issue.Number,
                "new-body"));
            
        //Assert
        var comments = await environment.GitHub.RestClient.Issue.Comment.GetAllForIssue(
            issue.Repository.Owner.Name,
            issue.Repository.Name,
            issue.Number);
        Assert.AreEqual(1, comments.Count);
        Assert.AreEqual("new-body", comments.Single().Body);
    }
        
    [TestMethod]
    public async Task Handle_NoExistingBotCommentFound_CreatesNewComment()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var issue = await environment.GitHub.IssueBuilder.BuildAsync();

        //Act
        await environment.Mediator.Send(
            new UpsertIssueCommentCommand(
                issue.Repository.Owner.Name,
                issue.Repository.Name,
                issue.Number,
                "body"));
            
        //Assert
        var comments = await environment.GitHub.RestClient.Issue.Comment.GetAllForIssue(
            issue.Repository.Owner.Name,
            issue.Repository.Name,
            issue.Number);
        Assert.AreEqual(1, comments.Count);
        Assert.AreEqual("body", comments.Single().Body);
    }
}