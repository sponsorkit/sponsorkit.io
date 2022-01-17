using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Api.Account.StripeConnect;

[TestClass]
public class SetupPostTest
{
    [TestMethod]
    public async Task HandleAsync_NoExistingStripeConnectAccountFound_CreatesNewStripeConnectAccount()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_NoExistingStripeConnectAccountFound_PersistsCreatedStripeConnectAccountToUserInDatabase()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_CancellationSignaledBeforeStripeConnectAccountCreation_DoesNotCancelStripeAccountCreation()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_CancellationSignaledBeforeStripeConnectAccountCreation_DoesNotCancelUserDatabaseUpdate()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}