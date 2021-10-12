using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Octokit;
using Sponsorkit.Domain.Controllers.Api.Account.Signup.FromGitHub;
using Sponsorkit.Infrastructure.GitHub;
using Sponsorkit.Infrastructure.Security.Jwt;
using Sponsorkit.Tests.TestHelpers.Builders.Models;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;
using OctokitUser = Octokit.User;

namespace Sponsorkit.Tests.Domain.Api.Account.Signup
{
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
                    default));

            fakeGitHubClient.User
                .Current()
                .Returns(new OctokitUser());

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

            await environment.Database.CreateUserAsync(new TestUserBuilder()
                .WithGitHub(
                    gitHubUserId,
                    "dummy",
                    await environment.EncryptionHelper.EncryptAsync(
                        "some-old-github-token")));

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

            await environment.Database.CreateUserAsync(new TestUserBuilder()
                .WithGitHub(
                    gitHubUserId,
                    "dummy",
                    await environment.EncryptionHelper.EncryptAsync(
                        "some-old-github-token")));

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
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_UserDoesNotExistInDatabase_AssignsNewStripeCustomerToCeatedUser()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task HandleAsync_CancellationSignaledBeforeDatabaseUserCreation_CancelsDatabaseUpdateBeforeStripeCustomerCreation()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
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
}