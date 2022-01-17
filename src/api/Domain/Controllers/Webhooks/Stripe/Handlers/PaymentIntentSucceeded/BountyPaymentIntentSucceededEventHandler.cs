using System;
using System.Data;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Controllers.Api.Bounties.PaymentIntent;
using Sponsorkit.Domain.Models.Context;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers.PaymentIntentSucceeded
{
    public class BountyPaymentIntentSucceededEventHandler : WebhookEventHandler<PaymentIntent>
    {
        private readonly DataContext dataContext;

        public BountyPaymentIntentSucceededEventHandler(
            DataContext dataContext)
        {
            this.dataContext = dataContext;
        }

        protected override bool CanHandle(string type, PaymentIntent data)
        {
            return type == Events.PaymentIntentSucceeded;
        }

        protected override async Task HandleAsync(string eventId, PaymentIntent data, CancellationToken cancellationToken)
        {
            var bountyId = Guid.Parse(data.Metadata[MetadataKeys.BountyId]);
            var paymentId = Guid.Parse(data.Metadata[MetadataKeys.PaymentId]);
            var claimRequestId = Guid.Parse(data.Metadata[MetadataKeys.ClaimRequestId]);

            await dataContext.ExecuteInTransactionAsync(
                async () =>
                {
                    var bounty = await dataContext.Bounties
                        .Include(x => x.ClaimRequests).ThenInclude(x => x.Creator)
                        .Include(x => x.Payments)
                        .SingleAsync(
                            x => x.Id == bountyId,
                            cancellationToken);

                    var payment = bounty.Payments.Single(x => x.Id == paymentId);
                    payment.TransferredToConnectedAccountAt = DateTimeOffset.Now;

                    var claimRequest = bounty.ClaimRequests.Single(x => x.Id == claimRequestId);
                    bounty.AwardedTo = claimRequest.Creator;

                    await dataContext.SaveChangesAsync(cancellationToken);
                },
                IsolationLevel.ReadUncommitted);
        }
    }
}