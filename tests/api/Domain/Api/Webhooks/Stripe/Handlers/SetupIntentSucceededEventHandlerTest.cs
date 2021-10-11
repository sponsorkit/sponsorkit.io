using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using NSubstitute;
using Octokit;
using Sponsorkit.Domain.Controllers.Api.Bounties.Intent;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers.SetupIntentSucceeded;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Tests.TestHelpers.Builders.Models;
using Sponsorkit.Tests.TestHelpers.Builders.Stripe.Stripe;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;
using Sponsorkit.Tests.TestHelpers.Octokit;
using Stripe;

namespace Sponsorkit.Tests.Domain.Api.Webhooks.Stripe.Handlers
{
    [TestClass]
    public class SetupIntentSucceededEventHandlerTest
    {
        [TestMethod]
        public async Task HandleAsync_CUstomerExistsInStripe_UpdatesDefaultPaymentMethod()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task CanHandle_TypeIsNotRight_CanNotHandle()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task CanHandle_TypeIsRight_CanHandle()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
    }
}