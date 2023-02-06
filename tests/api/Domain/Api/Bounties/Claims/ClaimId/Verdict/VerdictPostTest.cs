using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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

        var handler = environment.ScopeProvider.GetRequiredService<VerdictPost>();
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
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();
        
        var otherUser = await environment.Database.UserBuilder.BuildAsync();

        var otherUserClaim = await environment.Database.BountyClaimRequestBuilder
            .WithCreator(otherUser)
            .BuildAsync();

        var authenticatedUserClaim = await environment.Database.BountyClaimRequestBuilder
            .WithCreator(authenticatedUser)
            .BuildAsync();

        var handler = environment.ScopeProvider.GetRequiredService<VerdictPost>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        var response = await handler.HandleAsync(new PostRequest(
            authenticatedUserClaim.Id,
            ClaimVerdict.Scam));
            
        //Assert
        Assert.IsInstanceOfType<OkResult>(response);
    }
        
    [TestMethod]
    public async Task HandleAsync_NoMatchingClaimsPresent_ReturnsNotFound()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();

        var handler = environment.ScopeProvider.GetRequiredService<VerdictPost>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        var response = await handler.HandleAsync(new PostRequest(
            Guid.NewGuid(),
            ClaimVerdict.Undecided));
            
        //Assert
        Assert.IsInstanceOfType<NotFoundResult>(response);
    }
        
    [TestMethod]
    public async Task HandleAsync_MatchingClaimPresent_PersistsGivenVerdict()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();
        
        var otherUser = await environment.Database.UserBuilder.BuildAsync();

        var otherUserClaim = await environment.Database.BountyClaimRequestBuilder
            .WithCreator(otherUser)
            .BuildAsync();

        var authenticatedUserClaim = await environment.Database.BountyClaimRequestBuilder
            .WithCreator(authenticatedUser)
            .BuildAsync();

        var handler = environment.ScopeProvider.GetRequiredService<VerdictPost>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        var response = await handler.HandleAsync(new PostRequest(
            authenticatedUserClaim.Id,
            ClaimVerdict.Scam));
            
        //Assert
        Assert.IsInstanceOfType<OkResult>(response);

        var updatedClaim = await environment.Database.WithoutCachingAsync(async context =>
            await context.BountyClaimRequests.SingleAsync(x => x.Id == authenticatedUserClaim.Id));
        Assert.AreEqual(ClaimVerdict.Scam, updatedClaim.Verdict);
    }
}