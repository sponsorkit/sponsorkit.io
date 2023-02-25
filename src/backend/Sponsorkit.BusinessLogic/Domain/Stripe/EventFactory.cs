using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using Sponsorkit.BusinessLogic.Infrastructure.Options;
using Stripe;

namespace Sponsorkit.BusinessLogic.Domain.Stripe;

public class EventFactory : IEventFactory
{
    private readonly IOptionsMonitor<StripeOptions> stripeOptionsMonitor;

    public EventFactory(IOptionsMonitor<StripeOptions> stripeOptionsMonitor)
    {
        this.stripeOptionsMonitor = stripeOptionsMonitor;
    }

    public Event CreateEvent(string json, StringValues signatureHeader)
    {
        return EventUtility.ConstructEvent(
            json,
            signatureHeader,
            stripeOptionsMonitor.CurrentValue.WebhookSecretKey);
    }
}

public interface IEventFactory
{
    Event CreateEvent(string json, StringValues signatureHeader);
}