using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Api.Account.PaymentMethod.Intent
{
    public record Response(
        string SetupIntentClientSecret);
    
    public class Get : BaseAsyncEndpoint
        .WithoutRequest
        .WithResponse<Response>
    {
        private readonly DataContext dataContext;
        private readonly SetupIntentService setupIntentService;

        public Get(
            DataContext dataContext,
            SetupIntentService setupIntentService)
        {
            this.dataContext = dataContext;
            this.setupIntentService = setupIntentService;
        }
        
        [HttpGet("/api/account/payment-method/intent")]
        public override async Task<ActionResult<Response>> HandleAsync(CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetRequiredId();

            var user = await dataContext.Users.SingleAsync(
                x => x.Id == userId,
                cancellationToken);
            
            var intent = await setupIntentService.CreateAsync(
                new SetupIntentCreateOptions()
                {
                    Confirm = false,
                    Customer = user.StripeCustomerId
                },
                cancellationToken: cancellationToken);

            return new Response(
                intent.ClientSecret);
        }
    }
}