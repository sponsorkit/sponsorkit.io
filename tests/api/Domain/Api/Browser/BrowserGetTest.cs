using System;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Api.Browser.BrowserGet;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Azure;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Browser
{
    [TestClass]
    public class BrowserGetTest
    {
        [TestMethod]
        public void BrowserGet_BeneficiaryAndReferenceGiven_RedirectsToProperUrl()
        {
            //Arrange
            var function = new Function();
            
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