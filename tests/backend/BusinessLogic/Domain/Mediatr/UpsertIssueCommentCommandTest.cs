using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Octokit;
using Sponsorkit.BusinessLogic.Domain.Mediatr.GitHub;
using Sponsorkit.BusinessLogic.Infrastructure.Options.GitHub;
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
            
        //Act
        await environment.Mediator.Send(
            new UpsertIssueCommentCommand(
                "owner",
                "repo",
                1,
                "body"));
            
        //Assert
        await environment.GitHub.FakeClient.Issue.Comment
            .DidNotReceiveWithAnyArgs()
            .Create(default, default, default, default);

        await environment.GitHub.FakeClient.Issue.Comment
            .DidNotReceiveWithAnyArgs()
            .Update(default, default, default, default);
    }
        
    [TestMethod]
    public async Task Handle_ExistingBotCommentFound_UpdatesExistingComment()
    {
        //Arrange
        var botUserId = 1337;

        var fakeGitHubOptions = Substitute.For<IOptionsMonitor<GitHubOptions>>();
        fakeGitHubOptions.CurrentValue.Returns(new GitHubOptions()
        {
            BountyhuntBot = new GitHubBotOptions()
            {
                UserId = botUserId
            }
        });

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new ()
        {
            IocConfiguration = services => services.AddSingleton(fakeGitHubOptions)
        });

        environment.GitHub.FakeClient.Issue.Comment
            .GetAllForIssue(
                "sponsorkit",
                "repo",
                1)
            .Returns(new List<IssueComment>()
            {
                new (
                    default,
                    default,
                    default,
                    default,
                    default,
                    default,
                    default,
                    await environment.GitHub.UserBuilder
                        .WithId(botUserId)
                        .BuildAsync(),
                    default,
                    default)
            });
            
        //Act
        await environment.Mediator.Send(
            new UpsertIssueCommentCommand(
                "sponsorkit",
                "repo",
                1,
                "body"));
            
        //Assert
        await environment.GitHub.FakeClient.Issue.Comment
            .DidNotReceiveWithAnyArgs()
            .Create(default, default, default, default);

        await environment.GitHub.FakeClient.Issue.Comment
            .ReceivedWithAnyArgs(1)
            .Update(default, default, default, default);
    }
        
    [TestMethod]
    public async Task Handle_NoExistingBotCommentFound_CreatesNewComment()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();
            
        //Act
        await environment.Mediator.Send(
            new UpsertIssueCommentCommand(
                "sponsorkit",
                "repo",
                1,
                "body"));
            
        //Assert
        await environment.GitHub.FakeClient.Issue.Comment
            .ReceivedWithAnyArgs(1)
            .Create(default, default, default, default);

        await environment.GitHub.FakeClient.Issue.Comment
            .DidNotReceiveWithAnyArgs()
            .Update(default, default, default, default);
    }
}