using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Octokit;
using Sponsorkit.Api.Domain.Controllers.Api.Account.Signup.FromGitHub;
using Sponsorkit.BusinessLogic.Infrastructure.GitHub;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Jwt;
using Sponsorkit.Tests.TestHelpers.Builders.GitHub;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;
using Stripe;

namespace Sponsorkit.Tests.Api.Domain.Controllers.Account.Signup;

[TestClass]
public class FromGitHubPostTest
{
    [TestMethod]
    public async Task HandleAsync_ValidCodeGiven_ExchangesCodeForAccessToken()
    {
        //Arrange
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
            }
        });
        
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
            .Returns(new TestGitHubUser());
        
        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-github-token")
            .Returns(fakeGitHubClient);

        var handler = environment.ServiceProvider.GetRequiredService<FromGitHubPost>();
            
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
        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
            }
        });
        
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
            .Returns(new TestGitHubUser()
            {
                Id = gitHubUserId
            });
        
        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-new-github-token")
            .Returns(fakeGitHubClient);

        await environment.Database.UserBuilder
            .WithGitHub(
                gitHubUserId,
                "dummy",
                "some-old-github-token")
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<FromGitHubPost>();
            
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
        var fakeTokenFactory = Substitute.For<ITokenFactory>();
        fakeTokenFactory
            .Create(Arg.Any<Claim[]>())
            .Returns("some-jwt-token");
        
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
                services.AddSingleton(fakeTokenFactory);
            }
        });
        
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
            .Returns(new TestGitHubUser()
            {
                Id = gitHubUserId
            });

        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-new-github-token")
            .Returns(fakeGitHubClient);

        await environment.Database.UserBuilder
            .WithGitHub(
                gitHubUserId,
                "dummy",
                "some-old-github-token")
            .BuildAsync();

        var handler = environment.ServiceProvider.GetRequiredService<FromGitHubPost>();
            
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
        var fakeTokenFactory = Substitute.For<ITokenFactory>();
        fakeTokenFactory
            .Create(Arg.Any<Claim[]>())
            .Returns("some-jwt-token");
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
                services.AddSingleton(fakeTokenFactory);
            }
        });
        
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

        fakeGitHubClient.User
            .Current()
            .Returns(new TestGitHubUserBuilder().BuildAsync());

        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-new-github-token")
            .Returns(fakeGitHubClient);

        var handler = environment.ServiceProvider.GetRequiredService<FromGitHubPost>();
            
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
        var fakeTokenFactory = Substitute.For<ITokenFactory>();
        fakeTokenFactory
            .Create(Arg.Any<Claim[]>())
            .Returns("some-jwt-token");
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
                services.AddSingleton(fakeTokenFactory);
            }
        });
        
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

        fakeGitHubClient.User
            .Current()
            .Returns(new TestGitHubUserBuilder().BuildAsync());

        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-new-github-token")
            .Returns(fakeGitHubClient);

        var stripeCustomerService = environment.ServiceProvider.GetRequiredService<CustomerService>();

        var handler = environment.ServiceProvider.GetRequiredService<FromGitHubPost>();
            
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
        var fakeTokenFactory = Substitute.For<ITokenFactory>();
        fakeTokenFactory
            .Create(Arg.Any<Claim[]>())
            .Returns("some-jwt-token");
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
                services.AddSingleton(fakeTokenFactory);
            }
        });
        
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

        fakeGitHubClient.User
            .Current()
            .Returns(new TestGitHubUserBuilder().BuildAsync());

        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-new-github-token")
            .Returns(fakeGitHubClient);

        var handler = environment.ServiceProvider.GetRequiredService<FromGitHubPost>();

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
        var fakeTokenFactory = Substitute.For<ITokenFactory>();
        fakeTokenFactory
            .Create(Arg.Any<Claim[]>())
            .Returns("some-jwt-token");
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
                services.AddSingleton(fakeTokenFactory);
            }
        });
        
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

        fakeGitHubClient.User
            .Current()
            .Returns(new TestGitHubUserBuilder().BuildAsync());

        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-new-github-token")
            .Returns(fakeGitHubClient);

        var handler = environment.ServiceProvider.GetRequiredService<FromGitHubPost>();

        var cancellationTokenSource = new CancellationTokenSource();
        environment.Database.Context.SavedChanges += (_, _) =>
        {
            cancellationTokenSource.Cancel();
        };
            
        //Act
        await handler.HandleAsync(
            new("some-github-authentication-code"),
            cancellationTokenSource.Token);
            
        //Assert
        Assert.IsTrue(cancellationTokenSource.IsCancellationRequested);
        
        var userCount = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Users.CountAsync(default));
        Assert.AreEqual(1, userCount);
    }
        
    [TestMethod]
    public async Task HandleAsync_CancellationSignaledBeforeStripeCustomerCreation_DoesNotCancelDatabasePersistence()
    {
        //Arrange
        var fakeTokenFactory = Substitute.For<ITokenFactory>();
        fakeTokenFactory
            .Create(Arg.Any<Claim[]>())
            .Returns("some-jwt-token");
        var fakeGitHubClient = Substitute.For<IGitHubClient>();
        var fakeGitHubClientFactory = Substitute.For<IGitHubClientFactory>();

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeGitHubClient);
                services.AddSingleton(fakeGitHubClientFactory);
                services.AddSingleton(fakeTokenFactory);
            }
        });
        
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

        fakeGitHubClient.User
            .Current()
            .Returns(new TestGitHubUserBuilder().BuildAsync());

        fakeGitHubClientFactory
            .CreateClientFromOAuthAuthenticationToken("some-new-github-token")
            .Returns(fakeGitHubClient);

        var stripeCustomerService = environment.ServiceProvider.GetRequiredService<CustomerService>();

        var handler = environment.ServiceProvider.GetRequiredService<FromGitHubPost>();

        var cancellationTokenSource = new CancellationTokenSource();
        environment.Database.Context.SavedChanges += (_, _) =>
        {
            cancellationTokenSource.Cancel();
        };
            
        //Act
        var result = await handler.HandleAsync(
            new("some-github-authentication-code"),
            cancellationTokenSource.Token);
        Assert.IsNotNull(result.Value);
            
        //Assert
        Assert.IsTrue(cancellationTokenSource.IsCancellationRequested);
        
        var user = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Users.SingleAsync(default));
        Assert.IsNotNull(user.StripeCustomerId);

        var customer = await stripeCustomerService.GetAsync(user.StripeCustomerId, cancellationToken: default);
        Assert.IsNotNull(customer);
    }
}