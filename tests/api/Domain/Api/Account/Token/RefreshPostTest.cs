using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Api.Account.Token;

[TestClass]
public class RefreshPostTest
{
    [TestMethod]
    public async Task HandleAsync_NoClaimsPrincipalRetrievedFromToken_ReturnsUnauthorized()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_NoUserFoundForTokenUserId_ReturnsUnauthorized()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_ValidUserFound_ReturnsValidRefreshedToken()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}