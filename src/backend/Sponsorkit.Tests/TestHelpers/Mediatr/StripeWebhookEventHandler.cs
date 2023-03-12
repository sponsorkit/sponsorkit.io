using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Sponsorkit.BusinessLogic.Domain.Mediatr;
using Sponsorkit.Tests.TestHelpers.Environments;

namespace Sponsorkit.Tests.TestHelpers.Mediatr;

public class StripeWebhookEventHandler : INotificationHandler<StripeWebhookEvent>
{
    private readonly IIntegrationTestEnvironment environment;

    public StripeWebhookEventHandler(
        IIntegrationTestEnvironment environment)
    {
        this.environment = environment;
    }
    
    public async Task Handle(
        StripeWebhookEvent notification, 
        CancellationToken cancellationToken)
    {
        await environment.Stripe.OnStripeWebhookEventAsync(notification.StripeEvent);
    }
}