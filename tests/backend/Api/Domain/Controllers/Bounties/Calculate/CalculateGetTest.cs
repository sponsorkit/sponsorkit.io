using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Api.Domain.Controllers.Api.Bounties.Calculate;
using Sponsorkit.Tests.TestHelpers;

namespace Sponsorkit.Tests.Api.Domain.Controllers.Bounties.Calculate;

[TestClass]
public class CalculateGetTest
{
    [TestMethod]
    public async Task HandleAsync_AmountUnderMinimumAmount_ReturnsBadRequest()
    {
        //Arrange
        var handler = new CalculateGet();

        //Act
        var response = handler.Handle(new Request(10_00 - 0_01));
            
        //Assert
        Assert.IsInstanceOfType(response.Result, typeof(BadRequestObjectResult));
    }
        
    [TestMethod]
    public async Task HandleAsync_AmountEqualToMinimumAmount_ReturnsCalculationAmount()
    {
        //Arrange
        var handler = new CalculateGet();

        //Act
        var result = handler.Handle(new Request(10_00));
            
        //Assert
        var response = result.ToResponseObject();
        Assert.AreEqual(0_50, response.FeeAmountInHundreds);
    }
        
    [TestMethod]
    public async Task HandleAsync_AmountSlightlyAboveMinimum_ReturnsCalculationAmount()
    {
        //Arrange
        var handler = new CalculateGet();

        //Act
        var result = handler.Handle(new Request(10_01));
            
        //Assert
        var response = result.ToResponseObject();
        Assert.AreEqual(0_50, response.FeeAmountInHundreds);
    }
        
    [TestMethod]
    public async Task HandleAsync_AmountVeryHigh_ReturnsCalculationAmount()
    {
        //Arrange
        var handler = new CalculateGet();

        //Act
        var result = handler.Handle(new Request(100_000_00));
            
        //Assert
        var response = result.ToResponseObject();
        Assert.AreEqual(5_000_00, response.FeeAmountInHundreds);
    }
}