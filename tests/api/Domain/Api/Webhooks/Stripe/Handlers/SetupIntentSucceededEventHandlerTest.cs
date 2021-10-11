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
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Tests.TestHelpers.Builders.Models;
using Sponsorkit.Tests.TestHelpers.Builders.Stripe.Stripe;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;
using Stripe;

namespace Sponsorkit.Tests.Domain.Api.Webhooks.Stripe.Handlers
{
    [TestClass]
    public class SetupIntentSucceededEventHandlerTest
    {
        [TestMethod]
        public async Task HandleAsync_NoGitHubCommentFound_CreatesNewGitHubComment()
        {
            //Arrange
            await using var handle = await SponsorkitIntegrationTestEnvironment.CreateAsync();

            handle.GitHubMock.Repository
                .Get(
                    Arg.Any<string>(),
                    Arg.Any<string>())
                .Returns(new TestRepository());

            handle.GitHubMock.Issue
                .Get(
                    Arg.Any<string>(),
                    Arg.Any<string>(),
                    Arg.Any<int>())
                .Returns(new Issue());
            
            var handler = handle.ServiceProvider
                .GetRequiredService<IEnumerable<IWebhookEventHandler>>()
                .OfType<SetupIntentSucceededEventHandler>()
                .Single();
            var customer = await handle.Stripe.CustomerBuilder
                .WithDefaultPaymentMethod(handle.Stripe.PaymentMethodBuilder)
                .BuildAsync();

            var user = new TestUserBuilder()
                .WithStripeCustomerId(customer.Id)
                .Build();
            await handle.DataContext.Users.AddAsync(user);

            var issue = new TestIssueBuilder().Build();
            await handle.DataContext.Issues.AddAsync(issue);
            
            await handle.DataContext.SaveChangesAsync();

            //Act
            await handler.HandleAsync(
                "some-event-id",
                new SetupIntent()
                {
                    Id = "some-id",
                    CustomerId = customer.Id,
                    PaymentMethodId = customer.InvoiceSettings.DefaultPaymentMethodId,
                    Metadata = new Dictionary<string, string>()
                    {
                        { UniversalMetadataKeys.Type, UniversalMetadataTypes.BountySetupIntent },
                        { MetadataKeys.AmountInHundreds, 10_00.ToString(CultureInfo.InvariantCulture)},
                        { MetadataKeys.GitHubIssueNumber, issue.GitHub.Number.ToString(CultureInfo.InvariantCulture)},
                        { MetadataKeys.GitHubIssueOwnerName, "some-issue-owner-name"},
                        { MetadataKeys.GitHubIssueRepositoryName, "some-issue-repository-name" },
                        { MetadataKeys.UserId, user.Id.ToString() }
                    }
                },
                default);
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_UnrecognizedMetadataTypeGiven_ThrowsExceptionAndSetsDefaultPaymentMethod()
        {
            //Arrange

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
    }
}