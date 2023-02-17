using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Api.Domain.Controllers.Api.Account.Token.Refresh;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Jwt;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Account.Token;

[TestClass]
public class RefreshPostTest
{
    [TestMethod]
    public async Task HandleAsync_NoClaimsPrincipalRetrievedFromToken_ReturnsUnauthorized()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();
        
        var handler = environment.ServiceProvider.GetRequiredService<RefreshPost>();
            
        //Act
        var result = await handler.HandleAsync(new PostRequest("invalid"));
            
        //Assert
        Assert.IsInstanceOfType(result.Result, typeof(UnauthorizedResult));
    }
        
    [TestMethod]
    public async Task HandleAsync_NoUserFoundForTokenUserId_ReturnsUnauthorized()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var tokenFactory = environment.ServiceProvider.GetRequiredService<ITokenFactory>();
        var token = tokenFactory.Create(new [] {
            new Claim(
                ClaimTypes.NameIdentifier,
                Guid.NewGuid().ToString())
            });
        
        var handler = environment.ServiceProvider.GetRequiredService<RefreshPost>();
            
        //Act
        var result = await handler.HandleAsync(new PostRequest(token));
            
        //Assert
        Assert.IsInstanceOfType(result.Result, typeof(UnauthorizedResult));
    }
        
    [TestMethod]
    public async Task HandleAsync_ValidUserFound_ReturnsValidRefreshedToken()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var user = await environment.Database.UserBuilder.BuildAsync();

        var tokenFactory = environment.ServiceProvider.GetRequiredService<ITokenFactory>();
        var token = tokenFactory.Create(new [] {
            new Claim(
                ClaimTypes.NameIdentifier,
                user.Id.ToString())
        });
        
        var handler = environment.ServiceProvider.GetRequiredService<RefreshPost>();
        handler.FakeAuthentication(user);
            
        //Act
        var result = await handler.HandleAsync(new PostRequest(token));
            
        //Assert
        var response = result.ToResponseObject();
        Assert.IsNotNull(response?.Token);

        Assert.AreNotEqual(response.Token, token);
    }
}