using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Api.Bounties.Claims.ClaimId.Verdict
{
    [TestClass]
    public class VerdictPostTest
    {
        [TestMethod]
        public async Task HandleAsync_ClaimRequestBountyDoesNotBelongToAuthenticatedUser_ReturnsNotFound()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_MultipleClaimsPresent_PicksClaimById()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_NoMatchingClaimsPresent_ReturnsNotFound()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_MatchingClaimPresent_PersistsGivenVerdict()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
    }
}