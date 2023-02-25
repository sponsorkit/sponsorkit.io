using System;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Api.Domain.Controllers.Api.Sponsors.Beneficiary;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Api.Domain.Controllers.Sponsors;

[TestClass]
public class SponsorsBeneficiaryGetTest
{
    [TestMethod]
    public async Task SponsorsBeneficiaryGet_BeneficiaryFound_ReturnsProperResponse()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        var endpoint = environment.ServiceProvider.GetRequiredService<BeneficiaryGet>();

        var beneficiaryId = Guid.NewGuid();

        await environment.Database.UserBuilder
            .WithId(beneficiaryId)
            .WithGitHub(1337, "username", "accessToken")
            .BuildAsync();
            
        //Act
        var response = await endpoint.HandleAsync(
            new Request(beneficiaryId),
            default);
            
        //Assert
        var responseObject = response.ToResponseObject();

        Assert.AreEqual(beneficiaryId, responseObject.Id);
        Assert.AreEqual("1337", responseObject.GitHubId.ToString());
    }
}