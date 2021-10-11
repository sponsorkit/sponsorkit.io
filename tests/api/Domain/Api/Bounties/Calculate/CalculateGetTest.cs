using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Api.Bounties.Calculate
{
    [TestClass]
    public class CalculateGetTest
    {
        [TestMethod]
        public async Task HandleAsync_AmountUnderMinimumAmount_ReturnsBadRequest()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_AmountEqualToMinimumAmount_ReturnsCalculationAmount()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
    }
}