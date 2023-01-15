using System;
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
    public async Task HandleAsync_MultipleClaimsPresent_PicksClaimById()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();
        
        var otherUser = await environment.Database.UserBuilder.BuildAsync();

        var otherUserClaim = await environment.Database.BountyClaimRequestBuilder
            .WithCreator(otherUser)
            .WithVerdict(ClaimVerdict.Unsolved)
            .BuildAsync();

        var authenticatedUserClaim = await environment.Database.BountyClaimRequestBuilder
            .WithCreator(authenticatedUser)
            .WithVerdict(ClaimVerdict.Solved)
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<VerdictGet>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        var result = await handler.HandleAsync(new GetRequest(authenticatedUserClaim.Id));
            
        //Assert
        var response = result.ToResponseObject();
        Assert.AreEqual(ClaimVerdict.Solved, response.CurrentClaimVerdict);
    }
        
    [TestMethod]
    public async Task HandleAsync_NoMatchingClaimsPresent_ReturnsNotFound()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<VerdictGet>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        var result = await handler.HandleAsync(new GetRequest(Guid.NewGuid()));
            
        //Assert
        Assert.IsInstanceOfType<NotFoundResult>(result.Result);
    }
        
    [TestMethod]
    public async Task HandleAsync_GivenBountyIsFromOtherUser_ReturnsNotFound()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();

        var otherUser = await environment.Database.UserBuilder.BuildAsync();

        var otherUserBounty = await environment.Database.BountyBuilder
            .WithCreator(otherUser)
            .BuildAsync();
        
        var otherUserClaim = await environment.Database.BountyClaimRequestBuilder
            .WithCreator(otherUser)
            .WithBounty(otherUserBounty)
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<VerdictGet>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        var result = await handler.HandleAsync(new GetRequest(otherUserClaim.Id));
            
        //Assert
        Assert.IsInstanceOfType<NotFoundResult>(result.Result);
    }
        
    [TestMethod]
    public async Task HandleAsync_MatchingClaimPresent_ReturnsResponse()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var authenticatedUser = await environment.Database.UserBuilder.BuildAsync();

        var authenticatedUserClaim = await environment.Database.BountyClaimRequestBuilder
            .WithCreator(authenticatedUser)
            .WithVerdict(ClaimVerdict.Solved)
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<VerdictGet>();
        handler.FakeAuthentication(authenticatedUser);

        //Act
        var result = await handler.HandleAsync(new GetRequest(authenticatedUserClaim.Id));
            
        //Assert
        var response = result.ToResponseObject();
        Assert.AreEqual(ClaimVerdict.Solved, response.CurrentClaimVerdict);
    }
}