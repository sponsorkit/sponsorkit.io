using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Api.Account.PaymentMethod.Availability
{
    public enum PaymentMethodAvailability
    {
        NotAvailable,
        Available
    }

    public record Response(
        PaymentMethodAvailability Availability);
    
    public class Get : BaseAsyncEndpoint
        .WithoutRequest
        .WithResponse<Response>
    {
        private readonly DataContext dataContext;
        private readonly CustomerService customerService;
        private readonly PaymentMethodService paymentMethodService;

        public Get(
            DataContext dataContext,
            CustomerService customerService,
            PaymentMethodService paymentMethodService)
        {
            this.dataContext = dataContext;
            this.customerService = customerService;
            this.paymentMethodService = paymentMethodService;
        }
        
        [HttpGet("/api/account/payment-method/availability")]
        public override async Task<ActionResult<Response>> HandleAsync(CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetRequiredId();

            var user = await dataContext.Users.SingleAsync(
                x => x.Id == userId,
                cancellationToken);
            
            var customer = await customerService.GetAsync(
                user.StripeCustomerId, 
                cancellationToken: cancellationToken);
            if (customer == null)
                throw new InvalidOperationException("User did not have a customer.");

            if (customer.DefaultSource == null)
                return new Response(PaymentMethodAvailability.NotAvailable);

            var paymentMethod = await paymentMethodService.GetAsync(
                customer.DefaultSourceId,
                cancellationToken: cancellationToken);
            if(paymentMethod == null)
                throw new InvalidOperationException("The given payment method was not found.");
            
            return new Response(PaymentMethodAvailability.Available);
        }
    }
}