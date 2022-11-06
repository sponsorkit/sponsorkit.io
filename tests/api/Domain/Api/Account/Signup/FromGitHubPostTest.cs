using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Octokit;
using Sponsorkit.Domain.Controllers.Api.Account.Signup.FromGitHub;
using Sponsorkit.Infrastructure.GitHub;
using Sponsorkit.Infrastructure.Security.Jwt;
using Sponsorkit.Tests.TestHelpers.Builders.Database;
using Sponsorkit.Tests.TestHelpers.Builders.GitHub;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;
using Stripe;
using OctokitUser = Octokit.User;

namespace Sponsorkit.Tests.Domain.Api.Account.Signup;

[TestClass]
public class FromGitHubPostTest
{
    [TestMethod]
    public async Task HandleAsync_ValidCodeGiven_ExchangesCodeForAccessToken()
    {
        //Arrange
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        fakeGitHubClient.Oauth
            .CreateAccessToken(
                Arg.Is<OauthTokenRequest>(request => 
                    request.Code == "some-github-authentication-code"))
            .Returns(new OauthToken(
                default,
                "some-github-token",
                default,
                default,
                default,
                default));

        fakeGitHubClient.User
            .Current()
            .Returns(new TestGitHubUserBuilder().BuildAsync());

        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();
        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-github-token")
            .Returns(fakeGitHubClient);
            
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
            }
        });

        var handler = environment.ServiceProvider.GetRequiredService<Post>();
            
        //Act
        var result = await handler.HandleAsync(new(
            "some-github-authentication-code"));
            
        //Assert
        Assert.IsNotNull(result.Value);
    }
        
    [TestMethod]
    public async Task HandleAsync_UserAlreadyExistsInDatabase_UpdatesDatabaseUserWithNewAccessToken()
    {
        //Arrange
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        fakeGitHubClient.Oauth
            .CreateAccessToken(
                Arg.Is<OauthTokenRequest>(request => 
                    request.Code == "some-github-authentication-code"))
            .Returns(new OauthToken(
                default,
                "some-new-github-token",
                default,
                default,
                default,
                default));

        var gitHubUserId = 1337;
        fakeGitHubClient.User
            .Current()
            .Returns(new TestUser()
            {
                Id = gitHubUserId
            });

        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();
        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-new-github-token")
            .Returns(fakeGitHubClient);
            
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
            }
        });

        await environment.Database.UserBuilder
            .WithGitHub(
                gitHubUserId,
                "dummy",
                "some-old-github-token")
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<Post>();
            
        //Act
        var result = await handler.HandleAsync(new(
            "some-github-authentication-code"));
        Assert.IsNotNull(result.Value);
            
        var userCount = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Users.CountAsync());
        Assert.AreEqual(1, userCount);
            
        //Assert
        var user = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Users.SingleAsync());
        Assert.AreEqual(
            "some-new-github-token",
            await environment.EncryptionHelper.DecryptAsync(user.GitHub.EncryptedAccessToken));
    }
        
    [TestMethod]
    public async Task HandleAsync_UserAlreadyExistsInDatabase_GeneratesJwtTokenForUser()
    {
        //Arrange
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        fakeGitHubClient.Oauth
            .CreateAccessToken(
                Arg.Is<OauthTokenRequest>(request => 
                    request.Code == "some-github-authentication-code"))
            .Returns(new OauthToken(
                default,
                "some-new-github-token",
                default,
                default,
                default,
                default));

        var gitHubUserId = 1337;
        fakeGitHubClient.User
            .Current()
            .Returns(new TestUser()
            {
                Id = gitHubUserId
            });

        var fakeTokenFactory = Substitute.For<ITokenFactory>();
        fakeTokenFactory
            .Create(Arg.Any<Claim[]>())
            .Returns("some-jwt-token");

        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();
        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-new-github-token")
            .Returns(fakeGitHubClient);
            
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
                services.AddSingleton(fakeTokenFactory);
            }
        });

        await environment.Database.UserBuilder
            .WithGitHub(
                gitHubUserId,
                "dummy",
                "some-old-github-token")
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<Post>();
            
        //Act
        var result = await handler.HandleAsync(new(
            "some-github-authentication-code"));
        Assert.IsNotNull(result.Value);
            
        var userCount = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Users.CountAsync());
        Assert.AreEqual(1, userCount);
            
        //Assert
        Assert.AreEqual(
            "some-jwt-token",
            result.Value.Token);
    }
        
    [TestMethod]
    public async Task HandleAsync_UserDoesNotExistInDatabase_CreatesNewDatabaseUser()
    {
        //Arrange
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        fakeGitHubClient.Oauth
            .CreateAccessToken(
                Arg.Is<OauthTokenRequest>(request => 
                    request.Code == "some-github-authentication-code"))
            .Returns(new OauthToken(
                default,
                "some-new-github-token",
                default,
                default,
                default,
                default));

        var gitHubUserId = 1337;
        fakeGitHubClient.User
            .Current()
            .Returns(new TestUser()
            {
                Id = gitHubUserId
            });

        var fakeTokenFactory = Substitute.For<ITokenFactory>();
        fakeTokenFactory
            .Create(Arg.Any<Claim[]>())
            .Returns("some-jwt-token");

        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();
        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-new-github-token")
            .Returns(fakeGitHubClient);
            
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
                services.AddSingleton(fakeTokenFactory);
            }
        });

        var handler = environment.ServiceProvider.GetRequiredService<Post>();
            
        //Act
        var result = await handler.HandleAsync(new(
            "some-github-authentication-code"));
        Assert.IsNotNull(result.Value);
            
        //Assert
        var user = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Users.SingleAsync());
        Assert.IsNotNull(user);
    }
        
    [TestMethod]
    public async Task HandleAsync_UserDoesNotExistInDatabase_AssignsNewStripeCustomerToCeatedUser()
    {
        //Arrange
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        fakeGitHubClient.Oauth
            .CreateAccessToken(
                Arg.Is<OauthTokenRequest>(request => 
                    request.Code == "some-github-authentication-code"))
            .Returns(new OauthToken(
                default,
                "some-new-github-token",
                default,
                default,
                default,
                default));

        var gitHubUserId = 1337;
        fakeGitHubClient.User
            .Current()
            .Returns(new TestUser()
            {
                Id = gitHubUserId
            });

        var fakeTokenFactory = Substitute.For<ITokenFactory>();
        fakeTokenFactory
            .Create(Arg.Any<Claim[]>())
            .Returns("some-jwt-token");

        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();
        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-new-github-token")
            .Returns(fakeGitHubClient);
            
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
                services.AddSingleton(fakeTokenFactory);
            }
        });

        var stripeCustomerService = environment.ServiceProvider.GetRequiredService<CustomerService>();

        var handler = environment.ServiceProvider.GetRequiredService<Post>();
            
        //Act
        var result = await handler.HandleAsync(new(
            "some-github-authentication-code"));
        Assert.IsNotNull(result.Value);
            
        //Assert
        var user = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Users.SingleAsync());
        Assert.IsNotNull(user.StripeCustomerId);

        var customer = await stripeCustomerService.GetAsync(user.StripeCustomerId);
        Assert.IsNotNull(customer);
    }
        
    [TestMethod]
    public async Task HandleAsync_CancellationSignaledBeforeDatabaseUserCreation_CancelsDatabaseUpdateBeforeStripeCustomerCreation()
    {
        //Arrange
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        fakeGitHubClient.Oauth
            .CreateAccessToken(
                Arg.Is<OauthTokenRequest>(request => 
                    request.Code == "some-github-authentication-code"))
            .Returns(new OauthToken(
                default,
                "some-new-github-token",
                default,
                default,
                default,
                default));

        var gitHubUserId = 1337;
        fakeGitHubClient.User
            .Current()
            .Returns(new TestUser()
            {
                Id = gitHubUserId
            });

        var fakeTokenFactory = Substitute.For<ITokenFactory>();
        fakeTokenFactory
            .Create(Arg.Any<Claim[]>())
            .Returns("some-jwt-token");

        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();
        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-new-github-token")
            .Returns(fakeGitHubClient);
            
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
                services.AddSingleton(fakeTokenFactory);
            }
        });

        var handler = environment.ServiceProvider.GetRequiredService<Post>();

        var cancellationTokenSource = new CancellationTokenSource();
        cancellationTokenSource.Cancel();
            
        //Act
        var exception = await Assert.ThrowsExceptionAsync<OperationCanceledException>(async () => 
            await handler.HandleAsync(
                new("some-github-authentication-code"),
                cancellationTokenSource.Token));
        Assert.IsNotNull(exception);
            
        //Assert
        var userCount = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Users.CountAsync(default));
        Assert.AreEqual(0, userCount);
    }
        
    [TestMethod]
    public async Task HandleAsync_CancellationSignaledBeforeStripeCustomerCreation_DoesNotCancelStripeCustomerCreation()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_CancellationSignaledBeforeStripeCustomerCreation_DoesNotCancelDatabasePersistence()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}