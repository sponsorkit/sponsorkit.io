using System;
using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers;

public abstract class WebhookEventHandler<TData> : IWebhookEventHandler
    where TData : class
{
    protected abstract Task HandleAsync(string eventId, TData data, CancellationToken cancellationToken);
    protected abstract bool CanHandle(string type, TData data);

    public bool CanHandle(string type, object data)
    {
        return data is TData castedData && CanHandle(type, castedData);
    }

    public async Task HandleAsync(string eventId, object data, CancellationToken cancellationToken)
    {
        if (data is not TData castedData)
            throw new InvalidOperationException("Could not cast Stripe model to proper type.");

        await HandleAsync(eventId, castedData, cancellationToken);
    }
}