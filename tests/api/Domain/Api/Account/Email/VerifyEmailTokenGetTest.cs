using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Api.Account.Email
{
    [TestClass]
    public class VerifyEmailTokenGetTest
    {
        [TestMethod]
        public async Task HandleAsync_TokenTypeIsNotEmailVerificationToken_ReturnsUnauthorized()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_TokenHasNoEmail_ThrowsException()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_StripeCustomerUpdateFailed_RollsBackDatabaseEmailChanges()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_CancellationSignaledBeforeDatabaseUpdate_CancelsDatabaseOperationBeforeStripeCustomerUpdate()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_CancellationSignaledBeforeStripeCustomerUpdate_DoesNotCancelStripeCustomerUpdate()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
    }
}