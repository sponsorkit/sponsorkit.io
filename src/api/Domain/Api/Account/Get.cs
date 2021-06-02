using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Api.Account
{
    public record BeneficiaryResponse();

    public record SponsorResponse();

    public record Response(
        BeneficiaryResponse? Beneficiary,
        SponsorResponse? Sponsor);
    
    public class Get : BaseAsyncEndpoint
        .WithoutRequest
        .WithResponse<Response>
    {
        private readonly DataContext dataContext;
        
        private readonly PaymentMethodService paymentMethodService;
        private readonly CustomerService customerService;

        public Get(
            DataContext dataContext,
            PaymentMethodService paymentMethodService,
            CustomerService customerService)
        {
            this.dataContext = dataContext;
            this.paymentMethodService = paymentMethodService;
            this.customerService = customerService;
        }
        
        [HttpGet("/api/account")]
        public override async Task<ActionResult<Response>> HandleAsync(CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetRequiredId();
            
            var user = await dataContext.Users.SingleAsync(
                x => x.Id == userId,
                cancellationToken);

            var stripeCustomer = await customerService.GetAsync(
                user.StripeCustomerId, 
                cancellationToken: cancellationToken);
            if (stripeCustomer == null)
                throw new InvalidOperationException("User did not have a Stripe customer ID.");

            return Ok(new Response(
                user.StripeConnectId == null ?
                    null :
                    new BeneficiaryResponse(),
                stripeCustomer.InvoiceSettings.DefaultPaymentMethodId == null ?
                    null :
                    new SponsorResponse()));
        }
    }
}