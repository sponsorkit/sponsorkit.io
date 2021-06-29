using System;
using Microsoft.AspNetCore.Mvc;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Helpers;

namespace Sponsorkit.Tests.Domain.Helpers
{
    [TestClass]
    public class StripeFeeCalculatorTest
    {
        [TestMethod]
        public void GetStripeFeeInHundreds_DecimalGrossFeeGiven_CalculatesResult()
        {
            //Arrange
            var gross = 484_98;

            //Act
            var fees = FeeCalculator.GetStripeFeeInHundreds(gross);
            
            //Assert
            Assert.AreEqual(15_86, fees);
        }
        
        [TestMethod]
        public void GetAmountInHundredsIncludingStripeFeeOnTop_StraightNumberGiven_CalculatesResult()
        {
            //Arrange
            var gross = 100_00;

            //Act
            var fees = FeeCalculator.GetAmountWithAllFeesOnTop(gross);
            
            //Assert
            Assert.AreEqual(104_84, fees);
        }
    }
}