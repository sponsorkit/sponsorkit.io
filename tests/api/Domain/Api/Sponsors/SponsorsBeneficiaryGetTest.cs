﻿using System;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Domain.Controllers.Api.Sponsors.Beneficiary;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Api.Sponsors;

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
            .BuildAsync();
            
        //Act
        var response = await endpoint.HandleAsync(
            new Request(beneficiaryId),
            default);
            
        //Assert
        var responseObject = response.ToResponseObject();

        Assert.AreEqual("some-user-id", responseObject.Id.ToString());
        Assert.AreEqual("1337", responseObject.GitHubId.ToString());
    }
}