using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.BusinessLogic.Domain.Mediatr.GitHub;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.BusinessLogic.Domain.Mediatr;

[TestClass]
public class EnsureGitHubIssueInDatabaseCommandTest
{
    [TestMethod]
    public async Task Handle_NoRepositoryFound_ReturnsNotFound()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        //Act
        var result = await environment.Mediator.Send(
            new EnsureGitHubIssueInDatabaseCommand(
                "owner",
                "name",
                1));
            
        //Assert
        Assert.IsFalse(result.IsSuccess);
        Assert.AreEqual("Repository not found.", result.Errors.Single());
    }
        
    [TestMethod]
    public async Task Handle_NoIssueFound_ReturnsNotFound()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();
        
        //Act
        var result = await environment.Mediator.Send(
            new EnsureGitHubIssueInDatabaseCommand(
                "sponsorkit",
                "playground",
                13371337));

        //Assert
        Assert.IsFalse(result.IsSuccess);
        Assert.AreEqual("Issue not found.", result.Errors.Single());
    }
        
    [TestMethod]
    public async Task Handle_NoDatabaseRepositoryFound_CreatesNewRepository()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var issue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();

        var repository = await environment.GitHub.BountyhuntBot.RestClient.Repository.Get(
            "sponsorkit",
            "playground");
        
        //Act
        var result = await environment.Mediator.Send(
            new EnsureGitHubIssueInDatabaseCommand(
                "sponsorkit",
                "playground",
                issue.Number));

        //Assert
        var databaseRepository = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Repositories.SingleOrDefaultAsync());
        Assert.IsNotNull(databaseRepository);
        
        Assert.AreEqual(repository.Id, databaseRepository.GitHub.Id);
        Assert.AreEqual(repository.Name, databaseRepository.GitHub.Name);
        Assert.AreEqual(repository.Owner.Login, databaseRepository.GitHub.OwnerName);
    }
        
    [TestMethod]
    public async Task Handle_ExistingDatabaseRepositoryFound_UsesExistingRepository()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var issue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();

        var repository = await environment.GitHub.BountyhuntBot.RestClient.Repository.Get(
            "sponsorkit",
            "playground");
        
        var databaseRepository = await environment.Database.RepositoryBuilder
            .WithGitHubInformation(
                repository.Id,
                repository.Owner.Login,
                repository.Name)
            .BuildAsync();
        
        //Act
        var result = await environment.Mediator.Send(
            new EnsureGitHubIssueInDatabaseCommand(
                repository.Owner.Login,
                repository.Name,
                issue.Number));

        //Assert
        var refreshedDatabaseRepository = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Repositories.SingleOrDefaultAsync());
        Assert.IsNotNull(refreshedDatabaseRepository?.Id);

        Assert.AreEqual(refreshedDatabaseRepository.Id, databaseRepository.Id);
    }
        
    [TestMethod]
    public async Task Handle_NoDatabaseIssueFound_CreatesNewIssue()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var issue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();

        var repository = await environment.GitHub.BountyhuntBot.RestClient.Repository.Get(
            "sponsorkit",
            "playground");
        
        //Act
        var result = await environment.Mediator.Send(
            new EnsureGitHubIssueInDatabaseCommand(
                repository.Owner.Login,
                repository.Name,
                issue.Number));

        //Assert
        var databaseIssue = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Issues.SingleOrDefaultAsync());
        Assert.IsNotNull(databaseIssue);
        
        Assert.AreEqual(issue.Id, databaseIssue.GitHub.Id);
        Assert.AreEqual(issue.Number, databaseIssue.GitHub.Number);
        Assert.AreEqual(issue.Title, databaseIssue.GitHub.TitleSnapshot);
    }
        
    [TestMethod]
    public async Task Handle_ExistingDatabaseIssueFound_ReturnsExistingIssue()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var issue = await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync();

        var repository = await environment.GitHub.BountyhuntBot.RestClient.Repository.Get(
            "sponsorkit",
            "playground");
        
        var databaseIssue = await environment.Database.IssueBuilder
            .WithGitHubInformation(
                issue.Id,
                issue.Number,
                issue.Title)
            .BuildAsync();
        
        //Act
        var result = await environment.Mediator.Send(
            new EnsureGitHubIssueInDatabaseCommand(
                repository.Owner.Login,
                repository.Name,
                issue.Number));

        //Assert
        var refreshedDatabaseIssue = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Issues.SingleOrDefaultAsync());
        Assert.IsNotNull(refreshedDatabaseIssue?.Id);

        Assert.AreEqual(refreshedDatabaseIssue.Id, databaseIssue.Id);
    }
}