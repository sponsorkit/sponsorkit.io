using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Mediatr.Email;
using Sponsorkit.Domain.Mediatr.Email.Templates.VerifyEmailAddress;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Mediatr;

[TestClass]
public class EmailSendEmailCommandTest
{
    [TestMethod]
    public async Task Handle_SpecificTemplateGiven_PassesRenderedRazorEmailTemplateSuccessfullyToEmailService()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();
            
        //Act
        await environment.Mediator.Send(
            new SendEmailCommand(
                EmailSender.Bountyhunt,
                "dummy@example.com",
                "Subject",
                TemplateDirectory.VerifyEmailAddress,
                new Model("some-verification-url")));
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}