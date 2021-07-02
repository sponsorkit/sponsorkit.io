using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Signup.AsSponsor
{
    public record Request(string StripePaymentMethodId);
    
    public class Post : BaseAsyncEndpoint
        .WithRequest<Request>
        .WithoutResponse
    {
        private readonly DataContext dataContext;
        private readonly PaymentMethodService paymentMethodService;
        private readonly CustomerService customerService;

        public Post(
            DataContext dataContext,
            PaymentMethodService paymentMethodService,
            CustomerService customerService)
        {
            this.dataContext = dataContext;
            this.paymentMethodService = paymentMethodService;
            this.customerService = customerService;
        }
        
        [HttpPost("/api/signup/as-sponsor")]
        public override async Task<ActionResult> HandleAsync(Request request, CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetRequiredId();
            
            var user = await dataContext.Users.SingleAsync(
                x => x.Id == userId,
                cancellationToken);
            
            var existingPaymentMethods = await paymentMethodService
                .ListAutoPagingAsync(
                    new PaymentMethodListOptions()
                    {
                        Customer = user.StripeCustomerId,
                        Type = "card"
                    },
                    cancellationToken: cancellationToken)
                .ToListAsync(cancellationToken);

            await paymentMethodService.AttachAsync(
                request.StripePaymentMethodId,
                new PaymentMethodAttachOptions()
                {
                    Customer = user.StripeCustomerId
                }, cancellationToken: cancellationToken);

            await customerService.UpdateAsync(user.StripeCustomerId, new CustomerUpdateOptions()
            {
                InvoiceSettings = new CustomerInvoiceSettingsOptions()
                {
                    DefaultPaymentMethod = request.StripePaymentMethodId
                }
            }, cancellationToken: cancellationToken);

            foreach (var oldPaymentMethod in existingPaymentMethods)
            {
                await paymentMethodService.DetachAsync(
                    oldPaymentMethod.Id,
                    cancellationToken: cancellationToken);
            }

            return new OkResult();
        }
    }
}