using MediatR;
using Stripe;

namespace Sponsorkit.Domain.Mediatr;

public record StripeWebhookEvent(Event StripeEvent) : INotification;