using MediatR;
using Stripe;

namespace Sponsorkit.BusinessLogic.Domain.Mediatr;

public record StripeWebhookEvent(Event StripeEvent) : INotification;