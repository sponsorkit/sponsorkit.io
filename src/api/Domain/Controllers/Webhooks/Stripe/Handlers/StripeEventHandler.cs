using System;
using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers;

public abstract class StripeEventHandler<TData> : IStripeEventHandler<TData>
    where TData : class
{
    protected abstract Task HandleAsync(string eventId, TData data, CancellationToken cancellationToken);
    
    protected abstract bool CanHandleWebhookType(string type);
    protected abstract bool CanHandleData(TData data);

    public bool CanHandleWebhookType(string type, object data)
    {
        return 
            data is TData castedData && 
            CanHandleWebhookType(type) &&
            CanHandleData(castedData);
    }

    public bool CanHandleData(object data)
    {
        return
            data is TData castedData &&
            CanHandleData(castedData);
    }

    public async Task HandleAsync(string eventId, object data, CancellationToken cancellationToken)
    {
        if (data is not TData castedData)
            throw new InvalidOperationException("Could not cast Stripe model to proper type.");

        await HandleAsync(eventId, castedData, cancellationToken);
    }
}