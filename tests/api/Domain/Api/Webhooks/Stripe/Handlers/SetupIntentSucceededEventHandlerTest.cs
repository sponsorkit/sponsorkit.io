using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Api.Webhooks.Stripe.Handlers
{
    [TestClass]
    public class SetupIntentSucceededEventHandlerTest
    {
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
        public async Task HandleAsync_NoGitHubCommentFound_CreatesNewGitHubComment()
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