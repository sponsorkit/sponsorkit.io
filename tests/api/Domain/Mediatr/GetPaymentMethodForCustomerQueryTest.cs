using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Mediatr;

[TestClass]
public class GetPaymentMethodForCustomerQueryTest
{
    [TestMethod]
    public async Task Handle_CustomerNotFound_ThrowsException()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task Handle_CustomerHasDefaultPaymentMethod_ReturnsDefaultPaymentMethod()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task Handle_CustomerDoesNotHaveDefaultPaymentMethod_ReturnsFirstPaymentMethod()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}