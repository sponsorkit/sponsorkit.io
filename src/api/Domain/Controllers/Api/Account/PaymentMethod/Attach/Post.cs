using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Account.PaymentMethod.Attach
{
    public record Response(
        string? PaymentMethodId);
    
    public class Post: BaseAsyncEndpoint
        .WithoutRequest
        .WithResponse<Response>
    {
        private readonly DataContext dataContext;
        private readonly PaymentMethodService paymentMethodService;
        private readonly CustomerService customerService;
        private readonly IMediator mediator;

        public Post(
            DataContext dataContext,
            PaymentMethodService paymentMethodService,
            CustomerService customerService,
            IMediator mediator)
        {
            this.dataContext = dataContext;
            this.paymentMethodService = paymentMethodService;
            this.customerService = customerService;
            this.mediator = mediator;
        }

        [HttpPost("/api/account/payment-method/apply")]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status200OK)]
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
                throw new InvalidOperationException("Stripe customer was not found.");

            if (customer.DefaultSourceId != null)
                return new Response(null);

            var paymentMethod = await mediator.Send(
                new GetPaymentMethodForCustomerQuery(customer.Id),
                cancellationToken);
            if (paymentMethod == null)
                return new Response(null);

            await customerService.UpdateAsync(
                customer.Id,
                new CustomerUpdateOptions()
                {
                    InvoiceSettings = new CustomerInvoiceSettingsOptions()
                    {
                        DefaultPaymentMethod = paymentMethod.Id
                    }
                },
                cancellationToken: cancellationToken);

            return new Response(paymentMethod.Id);
        }
    }
}