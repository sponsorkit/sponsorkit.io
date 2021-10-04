using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Api.Account.Signup
{
    [TestClass]
    public class FromGitHubPostTest
    {
        [TestMethod]
        public async Task HandleAsync_ValidCodeGiven_ExchangesCodeForAccessToken()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_UserAlreadyExistsInDatabase_UpdatesDatabaseUserWithNewAccessToken()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_UserAlreadyExistsInDatabase_GeneratesJwtTokenForUser()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_UserDoesNotExistInDatabase_CreatesNewDatabaseUser()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_UserDoesNotExistInDatabase_AssignsNewStripeCustomerToCeatedUser()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_CancellationSignaledBeforeDatabaseUserCreation_CancelsDatabaseUpdateBeforeStripeCustomerCreation()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_CancellationSignaledBeforeStripeCustomerCreation_DoesNotCancelStripeCustomerCreation()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_CancellationSignaledBeforeStripeCustomerCreation_DoesNotCancelDatabasePersistence()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
    }
}