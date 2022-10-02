using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Api.Webhooks.Stripe.Handlers;

[TestClass]
public class SetupIntentSucceededEventHandlerTest
{
    [TestMethod]
    public async Task HandleAsync_CUstomerExistsInStripe_UpdatesDefaultPaymentMethod()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task CanHandle_TypeIsNotRight_CanNotHandle()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task CanHandle_TypeIsRight_CanHandle()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}