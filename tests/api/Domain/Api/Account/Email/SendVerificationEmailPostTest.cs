using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Sponsorkit.Domain.Controllers.Api.Account.Email.SendVerificationEmail;
using Sponsorkit.Domain.Mediatr.Email;
using Sponsorkit.Domain.Mediatr.Email.Templates.VerifyEmailAddress;
using Sponsorkit.Infrastructure.Security.Jwt;
using Sponsorkit.Tests.TestHelpers;

namespace Sponsorkit.Tests.Domain.Api.Account.Email;

[TestClass]
public class SendVerificationEmailPostTest
{
    [TestMethod]
    public async Task HandleAsync_ValidEmailSpecified_SendsVerificationMailWithTokenInUrl()
    {
        //Arrange
        var fakeMediator = Substitute.For<IMediator>();
            
        var fakeTokenFactory = Substitute.For<ITokenFactory>();
        fakeTokenFactory
            .Create(Arg.Any<IEnumerable<Claim>>())
            .Returns("some-token");

        var userId = Guid.NewGuid();
            
        var handler = new Post(
            fakeMediator,
            fakeTokenFactory);
        handler.FakeAuthentication(userId);
            
        //Act
        var response = await handler.HandleAsync(
            new Request("new-email@example.com", 
                Guid.NewGuid()));
        Assert.IsInstanceOfType(response, typeof(OkResult));
            
        //Assert
        await fakeMediator
            .Received(1)
            .Send(Arg.Is<SendEmailCommand>(command => 
                ((Model)command.Model).VerificationUrl.EndsWith("/some-token")));
    }
        
    [TestMethod]
    public async Task HandleAsync_ValidEmailSpecified_TokenContainsProperClaims()
    {
        //Arrange
        var fakeMediator = Substitute.For<IMediator>();
            
        var fakeTokenFactory = Substitute.For<ITokenFactory>();
        fakeTokenFactory
            .Create(Arg.Any<IEnumerable<Claim>>())
            .Returns("some-token");

        var userId = Guid.NewGuid();
            
        var handler = new Post(
            fakeMediator,
            fakeTokenFactory);
        handler.FakeAuthentication(userId);
            
        //Act
        var response = await handler.HandleAsync(
            new Request("new-email@example.com", 
                Guid.NewGuid()));
        Assert.IsInstanceOfType(response, typeof(OkResult));
            
        //Assert
        fakeTokenFactory
            .Received(1)
            .Create(Arg.Is<IEnumerable<Claim>>(claims => 
                claims
                    .Single(c => c.Type == "newEmail")
                    .Value == "new-email@example.com" &&
                claims
                    .Single(c => c.Type == ClaimTypes.Role)
                    .Value == "EmailVerification" &&
                claims
                    .Single(c => c.Type == JwtRegisteredClaimNames.Sub)
                    .Value == userId.ToString()));
    }
        
    [TestMethod]
    public async Task HandleAsync_ValidEmailSpecified_EmailContainsProperArguments()
    {
        //Arrange
        var fakeMediator = Substitute.For<IMediator>();
            
        var fakeTokenFactory = Substitute.For<ITokenFactory>();
        fakeTokenFactory
            .Create(Arg.Any<IEnumerable<Claim>>())
            .Returns("some-token");

        var userId = Guid.NewGuid();
            
        var handler = new Post(
            fakeMediator,
            fakeTokenFactory);
        handler.FakeAuthentication(userId);
            
        //Act
        var response = await handler.HandleAsync(
            new Request("new-email@example.com", 
                Guid.NewGuid()));
        Assert.IsInstanceOfType(response, typeof(OkResult));
            
        //Assert
        await fakeMediator
            .Received(1)
            .Send(Arg.Is<SendEmailCommand>(command => 
                command.Sender == EmailSender.Sponsorkit &&
                command.To == "new-email@example.com" &&
                command.TemplateDirectory == TemplateDirectory.VerifyEmailAddress));
    }
        
    [TestMethod]
    public async Task HandleAsync_NotAuthenticated_ThrowsException()
    {
        //Arrange
        var fakeMediator = Substitute.For<IMediator>();
        var fakeTokenFactory = Substitute.For<ITokenFactory>();
            
        var handler = new Post(
            fakeMediator,
            fakeTokenFactory);
            
        //Act
        var exception = await Assert.ThrowsExceptionAsync<InvalidOperationException>(async () => 
            await handler.HandleAsync(
                new Request(
                    "new-email@example.com", 
                    Guid.NewGuid())));
            
        //Assert
        Assert.AreEqual(
            "No user ID could be found. Perhaps the user is anonymous?",
            exception.Message);
    }
}