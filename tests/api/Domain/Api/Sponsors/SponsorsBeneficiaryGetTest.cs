using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Api.Sponsors.Beneficiary;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Sponsors
{
    [TestClass]
    public class SponsorsBeneficiaryGetTest
    {
        [TestMethod]
        public async Task SponsorsBeneficiaryGet_BeneficiaryFound_ReturnsProperResponse()
        {
            //Arrange
            await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

            var function = environment.ServiceProvider.GetRequiredService<Get>();
            
            //Act
            var response = await function.Execute(
                HttpRequestDataFactory.Empty,
                "some-beneficiary");
            
            //Assert
            var responseObject = await response.ToObject<Response>();

            Assert.AreEqual("some-user-id", responseObject.Id);
            Assert.AreEqual("some-github-id", responseObject.GitHubId);
        }
    }
}