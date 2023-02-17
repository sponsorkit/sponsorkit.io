namespace Sponsorkit.BusinessLogic.Domain.Stripe.Handlers;

public interface IStripeEventHandler
{
    bool CanHandleWebhookType(string type, object data);

    Task HandleAsync(
        string eventId,
        object data, 
        CancellationToken cancellationToken);
}