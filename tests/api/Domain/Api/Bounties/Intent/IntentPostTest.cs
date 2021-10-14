using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Api.Bounties.Intent
{
    [TestClass]
    public class IntentPostTest
    {
        [TestMethod]
        public async Task HandleAsync_GitHubIssueOrRepositoryNotFound_ReturnsNotFound()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_AmountBelowMinimumAmount_ReturnsBadRequest()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_PaymentMethodPresent_ReturnsCreatedSetupIntent()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
    }
}