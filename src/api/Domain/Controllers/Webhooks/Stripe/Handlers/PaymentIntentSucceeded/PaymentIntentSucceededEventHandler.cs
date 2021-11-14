using System;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Domain.Controllers.Api.Bounties.PaymentIntent;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers.PaymentIntentSucceeded
{
    public class PaymentIntentSucceededEventHandler : WebhookEventHandler<PaymentIntent>
    {
        protected override bool CanHandle(string type, PaymentIntent data)
        {
            return type == Events.PaymentIntentSucceeded;
        }

        protected override async Task HandleAsync(string eventId, PaymentIntent data, CancellationToken cancellationToken)
        {
            //TODO: handle actual data on webhook.
            var bountyId = Guid.Parse(data.Metadata[MetadataKeys.BountyId]);
        }
    }
}