using System.Threading;
using System.Threading.Tasks;
using Amazon.SimpleEmailV2;
using Amazon.SimpleEmailV2.Model;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Sponsorkit.BusinessLogic.Domain.Mediatr.Email;
using Sponsorkit.BusinessLogic.Domain.Mediatr.Email.Templates.VerifyEmailAddress;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Mediatr;

[TestClass]
public class EmailSendEmailCommandTest
{
    [TestMethod]
    public async Task Handle_SpecificTemplateGiven_PassesRenderedRazorEmailTemplateSuccessfullyToEmailService()
    {
        //Arrange
        var fakeEmailService = Substitute.For<IAmazonSimpleEmailServiceV2>();
        
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new () {
            IocConfiguration = services =>
            {
                services.AddSingleton(fakeEmailService);
            }
        });
            
        //Act
        await environment.Mediator.Send(
            new SendEmailCommand(
                EmailSender.Bountyhunt,
                "dummy@example.com",
                "Subject",
                TemplateDirectory.VerifyEmailAddress,
                new Model("some-verification-url")));
            
        //Assert
        await fakeEmailService
            .Received(1)
            .SendEmailAsync(
                Arg.Is<SendEmailRequest>(request =>
                    request.Content.Simple.Subject.Data == "Subject" &&
                    request.Content.Simple.Body.Html.Data.Contains("some-verification-url")),
                Arg.Any<CancellationToken>());
    }
}