using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.BusinessLogic.Domain.Mediatr;

[TestClass]
public class GetPaymentMethodForCustomerQueryTest
{
    [TestMethod]
    public async Task Handle_CustomerNotFound_ThrowsException()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();
        
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