using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Controllers.Api.Account;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Account;

[TestClass]
public class AccountGetTest
{
    [TestMethod]
    public async Task HandleAsync_StripeCustomerNotPresent_ThrowsException()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var handler = environment.ServiceProvider.GetRequiredService<AccountGet>();

        //Act
        await handler.HandleAsync(default);
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_EmailPresentOnAccount_ResponseIncludesEmail()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_GitHubInformationPresentOnAccount_ResponseIncludesGitHubUsername()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_EmailVerified_EmailVerifiedInResponse()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_EmailNotVerified_EmailNotVerifiedInResponse()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_NoStripeConnectAccountReferencePresentOnUser_ReturnsNullBeneficiaryResponse()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_ExistingStripeConnectAccountReferenceWithDetailsSubmittedPresentOnUser_ReturnsIsCompleted()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task HandleAsync_ExistingStripeConnectAccountReferenceWithNoDetailsSubmittedPresentOnUser_ReturnsIsNotCompleted()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}