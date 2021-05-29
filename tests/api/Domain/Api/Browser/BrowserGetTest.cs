using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Api.Browser
{
    [TestClass]
    public class BrowserGetTest
    {
        [TestMethod]
        public void BrowserGet_BeneficiaryAndReferenceGiven_RedirectsToProperUrl()
        {
            //Arrange
            var function = new Get();
            
            //Act
            var result = function.Run(
                HttpRequestDataFactory.Empty,
                "some-beneficiary",
                "some-reference");
            
            //Assert
            Assert.AreEqual(
                "/some-beneficiary?reference=some-reference", 
                result.Headers.GetValues("Location").Single());
        }
    }
}