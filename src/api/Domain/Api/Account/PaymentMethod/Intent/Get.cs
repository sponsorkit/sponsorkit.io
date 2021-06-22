using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Api.Account.PaymentMethod.Intent
{
    public record Response(
        string SetupIntentClientSecret,
        string? ExistingPaymentMethodId);
    
    public class Get : BaseAsyncEndpoint
        .WithoutRequest
        .WithResponse<Response>
    {
        private readonly DataContext dataContext;
        private readonly SetupIntentService setupIntentService;
        private readonly IMediator mediator;

        public Get(
            DataContext dataContext,
            SetupIntentService setupIntentService,
            IMediator mediator)
        {
            this.dataContext = dataContext;
            this.setupIntentService = setupIntentService;
            this.mediator = mediator;
        }
        
        [HttpGet("/api/account/payment-method/intent")]
        public override async Task<ActionResult<Response>> HandleAsync(CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetRequiredId();

            var user = await dataContext.Users.SingleAsync(
                x => x.Id == userId,
                cancellationToken);
            
            var paymentMethod = await mediator.Send(
                new GetPaymentMethodForCustomerQuery(user.StripeCustomerId),
                cancellationToken);
            
            var intent = await setupIntentService.CreateAsync(
                new SetupIntentCreateOptions()
                {
                    Confirm = false,
                    Customer = user.StripeCustomerId,
                    PaymentMethod = paymentMethod?.Id
                },
                cancellationToken: cancellationToken);

            return new Response(
                intent.ClientSecret,
                paymentMethod?.Id);
        }
    }
}