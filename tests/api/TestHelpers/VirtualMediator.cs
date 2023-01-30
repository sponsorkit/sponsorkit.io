using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediatR;

namespace Sponsorkit.Tests.TestHelpers;

public class VirtualMediator : IMediator
{
    private readonly Mediator mediator;

    public VirtualMediator(Mediator mediator)
    {
        this.mediator = mediator;
    }
    
    public virtual Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = new CancellationToken())
    {
        return mediator.Send(request, cancellationToken);
    }

    public virtual Task<object> Send(object request, CancellationToken cancellationToken = new CancellationToken())
    {
        return mediator.Send(request, cancellationToken);
    }

    public virtual IAsyncEnumerable<TResponse> CreateStream<TResponse>(IStreamRequest<TResponse> request, CancellationToken cancellationToken = new CancellationToken())
    {
        return mediator.CreateStream(request, cancellationToken);
    }

    public virtual IAsyncEnumerable<object> CreateStream(object request, CancellationToken cancellationToken = new CancellationToken())
    {
        return mediator.CreateStream(request, cancellationToken);
    }

    public virtual Task Publish(object notification, CancellationToken cancellationToken = new CancellationToken())
    {
        return mediator.Publish(notification, cancellationToken);
    }

    public virtual Task Publish<TNotification>(TNotification notification, CancellationToken cancellationToken = new CancellationToken()) where TNotification : INotification
    {
        return mediator.Publish(notification, cancellationToken);
    }
}