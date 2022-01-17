using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Api.Bounties.Claims;

[TestClass]
public class ClaimsPostTest
{
    [TestMethod]
    public async Task HandleAsync_IssueNotFound_ReturnsNotFound()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_PullRequestNotFound_ReturnsNotFound()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_ClaimAlreadyExistsForIssue_ReturnsBadRequest()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_ClaimerDoesNotOwnGivenPullRequest_ReturnsUnauthorized()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_ErrorDuringSecondClaimRequestCreation_RollsBackFirstClaimRequestCreation()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_MultipleClaimRequestsCreated_EmailsAreSentOutToBountyCreators()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}