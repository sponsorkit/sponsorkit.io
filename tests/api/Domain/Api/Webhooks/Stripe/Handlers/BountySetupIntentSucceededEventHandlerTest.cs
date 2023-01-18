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
    public async Task FullFlow_BountyDoesNotExist_CreatesBounty()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();
        
        
        
        Assert.Fail("I should be based on a full flow with webhooks.");
    }

    [TestMethod]
    public async Task FullFlow_BountyExistsAlready_AttachesPaymentToBounty()
    {
        Assert.Fail("I should be based on a full flow with webhooks.");
    }

    [TestMethod]
    public async Task FullFlow_Success_UpsertsGitHubComment()
    {
        Assert.Fail("I should be based on a full flow with webhooks.");
        
        //Arrange
        var fakeMediator = Substitute.For<IMediator>();
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new ()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeMediator);
            }
        });

        var issue = await environment.Database.IssueBuilder
            .WithGitHubInformation(
                id: 1338,
                number: 1339,
                titleSnapshot: "")
            .BuildAsync();
        fakeMediator
            .Send(
                Arg.Any<EnsureGitHubIssueInDatabaseCommand>(),
                default)
            .Returns(issue);
            
        var user = await environment.Database.UserBuilder.BuildAsync();

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
                    command.RepositoryName == "some-name" &&
                    command.IssueNumber == 1339),
                default);
    }
        
    [TestMethod]
    public async Task CanHandle_ProperMetadataAndType_CanHandle()
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

        var eventHandler = GetEventHandler(environment);

        //Act
        var canHandle = eventHandler.CanHandleData(new SetupIntent()
        {
            Metadata = new Dictionary<string, string>()
            {
                { UniversalMetadataKeys.Type, UniversalMetadataTypes.BountySetupIntent }
            }
        });
            
        //Assert
        Assert.IsTrue(canHandle);
    }
        
    [TestMethod]
    public async Task CanHandle_UnrecognizedTypeGiven_CanNotHandle()
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

        var eventHandler = GetEventHandler(environment);

        //Act
        var canHandle = eventHandler.CanHandleData(new SetupIntent()
        {
            Metadata = new Dictionary<string, string>()
            {
                { UniversalMetadataKeys.Type, "some-unknown-type" }
            }
        });
            
        //Assert
        Assert.IsFalse(canHandle);
    }
        
    [TestMethod]
    public async Task CanHandle_MetadataDoesNotContainTypeKey_CanNotHandle()
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

        var eventHandler = GetEventHandler(environment);

        //Act
        var canHandle = eventHandler.CanHandleData(new SetupIntent()
        {
            Metadata = new Dictionary<string, string>()
            {
                { "incorrect-type-key", "some-unknown-type" }
            }
        });
            
        //Assert
        Assert.IsFalse(canHandle);
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
        var handler = GetEventHandler(environment);
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

    private static BountySetupIntentSucceededEventHandler GetEventHandler(SponsorkitIntegrationTestEnvironment environment)
    {
        return environment.ServiceProvider
            .GetRequiredService<IEnumerable<IStripeEventHandler>>()
            .OfType<BountySetupIntentSucceededEventHandler>()
            .Single();
    }
}