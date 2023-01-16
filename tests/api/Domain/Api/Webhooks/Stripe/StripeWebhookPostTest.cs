using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Api.Webhooks.Stripe;

[TestClass]
public class StripeWebhookPostTest
{
    [TestMethod]
    public async Task HandleAsync_StripeSignatureNotPresent_ThrowsException()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_StripeSignatureNotPresent_ReturnsBadRequest()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_MultipleElligibleHandlersFound_ExecutesEveryHandler()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_MultipleElligibleHandlersFound_ReturnsOk()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_NoHandlersFound_ReturnsOk()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_EventAlreadyHandled_ReturnsOk()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}