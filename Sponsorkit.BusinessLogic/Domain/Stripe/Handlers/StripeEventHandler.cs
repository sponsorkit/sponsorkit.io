namespace Sponsorkit.BusinessLogic.Domain.Stripe.Handlers;

public abstract class StripeEventHandler<TData> : IStripeEventHandler
    where TData : class
{
    protected abstract Task HandleAsync(string eventId, TData data, CancellationToken cancellationToken);
    protected abstract bool CanHandleData(TData data);
    
    protected abstract bool CanHandleWebhookType(string type);

    public bool CanHandleWebhookType(string type, object data)
    {
        return 
            data is TData castedData && 
            CanHandleWebhookType(type) &&
            CanHandleData(castedData);
    }

    public async Task HandleAsync(string eventId, object data, CancellationToken cancellationToken)
    {
        if (data is not TData castedData)
            throw new InvalidOperationException("Could not cast Stripe model to proper type.");

        await HandleAsync(eventId, castedData, cancellationToken);
    }
}