﻿using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Controllers.Api.Bounties.Claims.ClaimId.Verdict;
using Sponsorkit.Domain.Models.Database;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Bounties.Claims.ClaimId.Verdict;

[TestClass]
public class VerdictPostTest
{
    [TestMethod]
    public async Task HandleAsync_ClaimRequestBountyDoesNotBelongToAuthenticatedUser_ReturnsNotFound()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();
        
        var otherUser = await environment.Database.UserBuilder.BuildAsync();

        var authenticatedUserClaim = await environment.Database.BountyClaimRequestBuilder
            .WithCreator(authenticatedUser)
            .BuildAsync();

        var otherUserClaim = await environment.Database.BountyClaimRequestBuilder
            .WithCreator(otherUser)
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<VerdictPost>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        var response = await handler.HandleAsync(new PostRequest(
            otherUserClaim.Id,
            ClaimVerdict.Undecided));
            
        //Assert
        Assert.IsInstanceOfType<NotFoundResult>(response);
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