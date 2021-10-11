using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Octokit;
using Sponsorkit.Domain.Controllers.Api.Bounties.Intent;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers.SetupIntentSucceeded;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Tests.TestHelpers.Builders.Models;
using Sponsorkit.Tests.TestHelpers.Builders.Stripe.Stripe;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;
using Stripe;

namespace Sponsorkit.Tests.Domain.Api.Webhooks.Stripe.Handlers
{
    [TestClass]
    public class BountySetupIntentSucceededEventHandlerTest
    {
        
        [TestMethod]
        public async Task HandleAsync_UnrecognizedMetadataTypeGiven_ThrowsExceptionAndSetsDefaultPaymentMethod()
        {
            //Arrange
            await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
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
        public async Task HandleAsync_NoGitHubCommentFound_CreatesNewGitHubComment()
        {
            //Arrange
            await using var environment = await TestEnvironment.CreateAsync();

            var issue = await environment.Database.CreateIssueAsync(new TestIssueBuilder());
            var user = await environment.Database.CreateUserAsync(new TestUserBuilder());

            //Act
            await environment.HandleAsync(new Metadata(
                10_00,
                issue.GitHub.Number,
                "some-issue-owner-name",
                "some-issue-repository-name",
                user.Id));
            
            //Assert
            Assert.Fail("Not implemented.");
        }

        [TestMethod]
        public async Task HandleAsync_GitHubCommentFound_UpdatesExistingGitHubComment()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task CanHandle_SetupEventSuccededTypeGiven_CanHandle()
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

        private record Metadata(
            long AmountInHundreds,
            int GitHubIssueNumber,
            string GitHubOwnerName,
            string GitHubRepositoryName,
            Guid UserId);
        
        private class TestEnvironment : SponsorkitIntegrationTestEnvironment
        {
            private BountySetupIntentSucceededEventHandler Handler => ServiceProvider
                .GetRequiredService<IEnumerable<IWebhookEventHandler>>()
                .OfType<BountySetupIntentSucceededEventHandler>()
                .Single();
            
            public static async Task<TestEnvironment> CreateAsync()
            {
                var environment = new TestEnvironment();
                await environment.InitializeAsync();

                return environment;
            }

            public async Task HandleAsync(Metadata metadata)
            {
                await Handler.HandleAsync(
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

            protected override async Task InitializeAsync()
            {
                await base.InitializeAsync();
                
                GitHubMock.Repository
                    .Get(
                        Arg.Any<string>(),
                        Arg.Any<string>())
                    .Returns(new TestRepository());

                GitHubMock.Issue
                    .Get(
                        Arg.Any<string>(),
                        Arg.Any<string>(),
                        Arg.Any<int>())
                    .Returns(new Issue());
            }
        }
    }
}