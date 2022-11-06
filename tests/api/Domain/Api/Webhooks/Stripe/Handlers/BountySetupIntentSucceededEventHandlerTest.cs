using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Sponsorkit.Domain.Controllers.Api.Bounties.SetupIntent;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers.SetupIntentSucceeded;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Tests.TestHelpers.Builders.Database;
using Sponsorkit.Tests.TestHelpers.Builders.GitHub;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Stripe;

namespace Sponsorkit.Tests.Domain.Api.Webhooks.Stripe.Handlers;

[TestClass]
public class BountySetupIntentSucceededEventHandlerTest
{
    [TestMethod]
    public async Task HandleAsync_NoUserFoundFromMetadata_ThrowsException()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_NoUserFoundFromMetadata_RollsBackCreatedIssue()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_NoExistingBountyFound_CreatesNewBounty()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_ExistingBountyFound_UpdatesBountyAmount()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_PreviouslyHandled_RollsBackToMakeSureBountyAmountIsUnchanged()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_PreviouslyHandled_ThrowsError()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_Success_UpsertsGitHubComment()
    {
        //Arrange
        var fakeMediator = Substitute.For<IMediator>();
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new ()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeMediator);
            }
        });

        var issue = await environment.Database.CreateIssueAsync(new TestIssueBuilder()
            .WithGitHubInformation(
                id: 1338,
                number: 1339,
                titleSnapshot: ""));
        fakeMediator
            .Send(
                Arg.Any<EnsureGitHubIssueInDatabaseCommand>(),
                default)
            .Returns(issue);
            
        var user = await environment.Database.CreateUserAsync(new TestUserBuilder());

        //Act
        await CallHandleAsync(
            environment,
            new Metadata(
                10_00,
                issue.GitHub.Number,
                issue.Repository.GitHub.OwnerName,
                issue.Repository.GitHub.Name,
                user.Id));
            
        //Assert
        await fakeMediator
            .Received(1)
            .Send(
                Arg.Is<UpsertIssueCommentCommand>(command => 
                    command.OwnerName == "some-owner-name" &&
                    command.RepositoryName == "some-repository-name" &&
                    command.IssueNumber == 1339),
                default);
    }
        
    [TestMethod]
    public async Task CanHandle_ProperMetadataAndType_CanHandle()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task CanHandle_UnrecognizedTypeGiven_CanNotHandle()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task CanHandle_UnrecognizedMetadataTypeGiven_CanNotHandle()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task CanHandle_MetadataDoesNotContainTypeKey_CanNotHandle()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }

    private record Metadata(
        long AmountInHundreds,
        int GitHubIssueNumber,
        string GitHubOwnerName,
        string GitHubRepositoryName,
        Guid UserId);

    private static async Task CallHandleAsync(
        SponsorkitIntegrationTestEnvironment environment,
        Metadata metadata)
    {
        var handler = environment.ServiceProvider
            .GetRequiredService<IEnumerable<IStripeEventHandler>>()
            .OfType<BountySetupIntentSucceededEventHandler>()
            .Single();
        await handler.HandleAsync(
            "some-event-id",
            new SetupIntent()
            {
                Id = "some-id",
                Metadata = new Dictionary<string, string>()
                {
                    {
                        UniversalMetadataKeys.Type, UniversalMetadataTypes.BountySetupIntent
                    },
                    {
                        MetadataKeys.AmountInHundreds, metadata.AmountInHundreds.ToString(CultureInfo.InvariantCulture)
                    },
                    {
                        MetadataKeys.GitHubIssueNumber, metadata.GitHubIssueNumber.ToString(CultureInfo.InvariantCulture)
                    },
                    {
                        MetadataKeys.GitHubIssueOwnerName, metadata.GitHubOwnerName
                    },
                    {
                        MetadataKeys.GitHubIssueRepositoryName, metadata.GitHubRepositoryName
                    },
                    {
                        MetadataKeys.UserId, metadata.UserId.ToString()
                    }
                }
            },
            default);
    }
}