using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Controllers.Api.Bounties.Claims.ClaimId.Verdict;
using Sponsorkit.Domain.Models.Database;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Bounties.Claims.ClaimId.Verdict;

[TestClass]
public class VerdictGetTest
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
    public async Task HandleAsync_MatchingClaimPresent_ReturnsResponse()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}