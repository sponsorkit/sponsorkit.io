using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Tests.TestHelpers.Environments;

namespace Sponsorkit.Tests.TestHelpers.Mediatr;

public class BackgroundEndpointErrorEventHandler : INotificationHandler<BackgroundEndpointErrorEvent>
{
    private readonly IIntegrationTestEntrypoint entrypoint;

    public BackgroundEndpointErrorEventHandler(
        IIntegrationTestEntrypoint entrypoint)
    {
        this.entrypoint = entrypoint;
    }
    
    public async Task Handle(
        BackgroundEndpointErrorEvent notification, 
        CancellationToken cancellationToken)
    {
        await entrypoint.OnBackgroundEndpointErrorAsync(notification.Exception);
    }
}