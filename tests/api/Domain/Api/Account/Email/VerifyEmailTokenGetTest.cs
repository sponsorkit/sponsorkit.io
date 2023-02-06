using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Sponsorkit.Domain.Controllers.Api.Account.Email.VerifyEmailToken;
using Sponsorkit.Infrastructure.Security.Encryption;
using Sponsorkit.Infrastructure.Security.Jwt;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Stripe;

namespace Sponsorkit.Tests.Domain.Api.Account.Email;

[TestClass]
public class VerifyEmailTokenGetTest
{
    [TestMethod]
    public async Task HandleAsync_TokenTypeIsNotEmailVerificationToken_ReturnsUnauthorized()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();
        var handler = environment.ServiceProvider.GetRequiredService<Get>();

        var tokenFactory = environment.ServiceProvider.GetRequiredService<ITokenFactory>();

        var userId = Guid.NewGuid();

        var token = tokenFactory.Create(new[]
        {
            new Claim(
                JwtRegisteredClaimNames.Sub,
                userId.ToString()),
            new Claim(
                "newEmail",
                "dummy@example.com"),
            new Claim(
                ClaimTypes.Role,
                "some-unknown-role")
        });

        //Act
        var response = await handler.HandleAsync(new(token, Guid.NewGuid()));

        //Assert
        Assert.IsInstanceOfType(response, typeof(UnauthorizedResult));
    }

    [TestMethod]
    public async Task HandleAsync_TokenHasNoEmail_ThrowsException()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();
        var handler = environment.ServiceProvider.GetRequiredService<Get>();

        var tokenFactory = environment.ServiceProvider.GetRequiredService<ITokenFactory>();

        var userId = Guid.NewGuid();

        var token = tokenFactory.Create(new[]
        {
            new Claim(
                JwtRegisteredClaimNames.Sub,
                userId.ToString()),
            new Claim(
                ClaimTypes.Role,
                "EmailVerification")
        });

        //Act
        var exception = await Assert.ThrowsExceptionAsync<InvalidOperationException>(async () =>
            await handler.HandleAsync(new(token, Guid.NewGuid())));

        //Assert
        Assert.AreEqual(
            "No email claim found.",
            exception.Message);
    }

    [TestMethod]
    public async Task HandleAsync_StripeCustomerUpdateFailed_RollsBackDatabaseEmailChanges()
    {
        //Arrange
        var fakeStripeCustomerService = Substitute.ForPartsOf<CustomerService>();
        fakeStripeCustomerService
            .UpdateAsync(
                Arg.Any<string>(),
                Arg.Any<CustomerUpdateOptions>())
            .Throws<TestException>();

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services => { services.AddSingleton(fakeStripeCustomerService); }
        });

        var tokenFactory = environment.ServiceProvider.GetRequiredService<ITokenFactory>();
        var aesEncryptionHelper = environment.ServiceProvider.GetRequiredService<IEncryptionHelper>();

        var user = await environment.Database.UserBuilder
            .WithoutStripeCustomer()
            .WithEmail("old-email@example.com")
            .BuildAsync();
        var token = tokenFactory.Create(new[]
        {
            new Claim(
                JwtRegisteredClaimNames.Sub,
                user.Id.ToString()),
            new Claim(
                "newEmail",
                "new-email@example.com"),
            new Claim(
                ClaimTypes.Role,
                "EmailVerification")
        });

        var handler = environment.ServiceProvider.GetRequiredService<Get>();

        //Act
        var exception = await Assert.ThrowsExceptionAsync<TestException>(async () =>
            await handler.HandleAsync(new(token, Guid.NewGuid())));
        Assert.IsNotNull(exception);

        //Assert
        var updatedUser = await environment.Database.WithoutCachingAsync(async dataContext =>
            await dataContext.Users.SingleAsync());
        Assert.AreEqual(
            "old-email@example.com",
            await aesEncryptionHelper.DecryptAsync(updatedUser.EncryptedEmail));
    }

    [TestMethod]
    public async Task HandleAsync_CancellationSignaledBeforeDatabaseUpdate_CancelsDatabaseOperationBeforeStripeCustomerUpdate()
    {
        //Arrange
        var fakeStripeCustomerService = Substitute.ForPartsOf<CustomerService>();
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services => { services.AddSingleton(fakeStripeCustomerService); }
        });

        var tokenFactory = environment.ServiceProvider.GetRequiredService<ITokenFactory>();

        var user = await environment.Database.UserBuilder
            .WithoutStripeCustomer()
            .WithEmail("old-email@example.com")
            .BuildAsync();
        var token = tokenFactory.Create(new[]
        {
            new Claim(
                JwtRegisteredClaimNames.Sub,
                user.Id.ToString()),
            new Claim(
                "newEmail",
                "new-email@example.com"),
            new Claim(
                ClaimTypes.Role,
                "EmailVerification")
        });

        var handler = environment.ServiceProvider.GetRequiredService<Get>();

        var cancellationTokenSource = new CancellationTokenSource();
        cancellationTokenSource.Cancel();

        //Act
        var exception = await Assert.ThrowsExceptionAsync<OperationCanceledException>(async () =>
            await handler.HandleAsync(
                new(token, Guid.NewGuid()),
                cancellationTokenSource.Token));
        Assert.IsNotNull(exception);

        //Assert
        await fakeStripeCustomerService
            .ReceivedWithAnyArgs(0)
            .UpdateAsync(
                default,
                default,
                default,
                default);
    }

    [TestMethod]
    public async Task HandleAsync_CancellationSignaledBeforeStripeCustomerUpdate_DoesNotCancelStripeCustomerUpdate()
    {
        //Arrange
        var fakeStripeCustomerService = Substitute.ForPartsOf<CustomerService>();
        fakeStripeCustomerService
            .UpdateAsync(
                Arg.Any<string>(),
                Arg.Any<CustomerUpdateOptions>())
            .Returns(new Customer());

        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new()
        {
            IocConfiguration = services => { services.AddSingleton(fakeStripeCustomerService); }
        });

        var tokenFactory = environment.ServiceProvider.GetRequiredService<ITokenFactory>();

        var user = await environment.Database.UserBuilder
            .WithoutStripeCustomer()
            .WithEmail("old-email@example.com")
            .BuildAsync();
        var token = tokenFactory.Create(new[]
        {
            new Claim(
                JwtRegisteredClaimNames.Sub,
                user.Id.ToString()),
            new Claim(
                "newEmail",
                "new-email@example.com"),
            new Claim(
                ClaimTypes.Role,
                "EmailVerification")
        });

        var handler = environment.ServiceProvider.GetRequiredService<Get>();

        var cancellationTokenSource = new CancellationTokenSource();

        //Act
        var result = await handler.HandleAsync(
            new(token, Guid.NewGuid()),
            cancellationTokenSource.Token);
        Assert.IsInstanceOfType(result, typeof(RedirectResult));

        //Assert
        await fakeStripeCustomerService
            .Received(1)
            .UpdateAsync(
                Arg.Any<string>(),
                Arg.Any<CustomerUpdateOptions>(),
                Arg.Any<RequestOptions>(),
                CancellationToken.None);
    }
}