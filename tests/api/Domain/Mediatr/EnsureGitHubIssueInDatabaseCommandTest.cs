﻿using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using NSubstitute.Extensions;
using Octokit;
using Octokit.GraphQL.Core;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;

namespace Sponsorkit.Tests.Domain.Mediatr;

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

        environment.GitHub.FakeClient.Repository
            .Get(Arg.Any<string>(), Arg.Any<string>())
            .Returns(new TestRepository());
        
        //Act
        var result = await environment.Mediator.Send(
            new EnsureGitHubIssueInDatabaseCommand(
                "owner",
                "name",
                1337));

        //Assert
        Assert.IsFalse(result.IsSuccess);
        Assert.AreEqual("Issue not found.", result.Errors.Single());
    }
        
    [TestMethod]
    public async Task Handle_NoDatabaseRepositoryFound_CreatesNewRepository()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var gitHubIssue = new TestIssue();
        environment.GitHub.FakeClient.Issue
            .Get(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<int>())
            .Returns(gitHubIssue);
        
        var gitHubRepository = new TestRepository();
        environment.GitHub.FakeClient.Repository
            .Get(Arg.Any<string>(), Arg.Any<string>())
            .Returns(gitHubRepository);
        
        //Act
        var result = await environment.Mediator.Send(
            new EnsureGitHubIssueInDatabaseCommand(
                gitHubRepository.Owner.Login,
                gitHubRepository.Name,
                gitHubIssue.Number));

        //Assert
        var databaseRepository = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Repositories.SingleOrDefaultAsync());
        Assert.IsNotNull(databaseRepository);
        
        Assert.AreEqual(gitHubRepository.Id, databaseRepository.GitHub.Id);
        Assert.AreEqual(gitHubRepository.Name, databaseRepository.GitHub.Name);
        Assert.AreEqual(gitHubRepository.Owner.Login, databaseRepository.GitHub.OwnerName);
    }
        
    [TestMethod]
    public async Task Handle_ExistingDatabaseRepositoryFound_UsesExistingRepository()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task Handle_NoDatabaseIssueFound_CreatesNewIssue()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var gitHubIssue = new TestIssue();
        environment.GitHub.FakeClient.Issue
            .Get(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<int>())
            .Returns(gitHubIssue);
        
        var gitHubRepository = new TestRepository();
        environment.GitHub.FakeClient.Repository
            .Get(Arg.Any<string>(), Arg.Any<string>())
            .Returns(gitHubRepository);
        
        //Act
        var result = await environment.Mediator.Send(
            new EnsureGitHubIssueInDatabaseCommand(
                gitHubRepository.Owner.Login,
                gitHubRepository.Name,
                gitHubIssue.Number));

        //Assert
        var databaseIssue = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Issues.SingleOrDefaultAsync());
        Assert.IsNotNull(databaseIssue);
        
        Assert.AreEqual(gitHubIssue.Id, databaseIssue.GitHub.Id);
        Assert.AreEqual(gitHubIssue.Number, databaseIssue.GitHub.Number);
        Assert.AreEqual(gitHubIssue.Title, databaseIssue.GitHub.TitleSnapshot);
    }
        
    [TestMethod]
    public async Task Handle_ExistingDatabaseIssueFound_ReturnsExistingIssue()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task Handle_IssueHappensDuringIssueCreation_RepositoryChangesAreRolledBack()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}