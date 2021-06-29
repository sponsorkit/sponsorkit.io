using System;
using Microsoft.AspNetCore.Mvc;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Controllers.Api.Browser.BeneficiaryIdReference;

namespace Sponsorkit.Tests.Domain.Api.Browser
{
    [TestClass]
    public class BrowserGetTest
    {
        [TestMethod]
        public void BrowserGet_BeneficiaryAndReferenceGiven_RedirectsToProperUrl()
        {
            //Arrange
            var endpoint = new Get();

            var beneficiaryId = Guid.NewGuid();
            
            //Act
            var result = endpoint.Handle(new Request(
                beneficiaryId,
                "some-reference"));
            
            //Assert
            var redirectResult = result as RedirectResult;
            
            Assert.AreEqual(
                $"/{beneficiaryId}?reference=some-reference", 
                redirectResult?.Url);
        }
    }
}