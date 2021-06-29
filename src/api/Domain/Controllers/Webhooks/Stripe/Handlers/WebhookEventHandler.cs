using System;
using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers
{
    public abstract class WebhookEventHandler<TData> : IWebhookEventHandler
        where TData : class
    {
        protected abstract Task HandleAsync(TData data, CancellationToken cancellationToken);
        public abstract bool CanHandle(string type);

        public async Task HandleAsync(object data, CancellationToken cancellationToken)
        {
            if (data is not TData castedData)
                throw new InvalidOperationException("Could not cast Stripe model to proper type.");

            await HandleAsync(castedData, cancellationToken);
        }
    }
}