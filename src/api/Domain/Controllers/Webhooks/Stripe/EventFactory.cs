using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using Sponsorkit.Infrastructure.Options;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe;

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