using System;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Domain.Models.Context;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers.SetupIntentSucceeded
{
    /// <summary>
    /// Posts a bounty to the database once the 
    /// </summary>
    public class SetupIntentSucceededEventHandler : WebhookEventHandler<SetupIntent>
    {
        private readonly CustomerService customerService;

        public SetupIntentSucceededEventHandler(
            CustomerService customerService)
        {
            this.customerService = customerService;
        }

        protected override bool CanHandle(string type, SetupIntent data)
        {
            return type == Events.SetupIntentSucceeded;
        }

        protected override async Task HandleAsync(string eventId, SetupIntent data, CancellationToken cancellationToken)
        {
            await SetPaymentMethodAsDefaultAsync(data, cancellationToken);
        }

        private async Task SetPaymentMethodAsDefaultAsync(SetupIntent data, CancellationToken cancellationToken)
        {
            await customerService.UpdateAsync(
                data.CustomerId,
                new CustomerUpdateOptions()
                {
                    InvoiceSettings = new CustomerInvoiceSettingsOptions()
                    {
                        DefaultPaymentMethod = data.PaymentMethodId
                    }
                },
                cancellationToken: cancellationToken);
        }
    }
}