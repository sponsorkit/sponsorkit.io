using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.Extensions.DependencyInjection;

namespace Sponsorkit.Tests.TestHelpers;

public class VirtualMediator : IMediator
{
    private readonly IServiceProvider serviceProvider;

    private IMediator Mediator => serviceProvider.GetRequiredService<Mediator>();

    public VirtualMediator(IServiceProvider serviceProvider)
    {
        this.serviceProvider = serviceProvider;
    }
    
    public virtual Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = new CancellationToken())
    {
        return Mediator.Send(request, cancellationToken);
    }

    public virtual Task<object> Send(object request, CancellationToken cancellationToken = new CancellationToken())
    {
        return Mediator.Send(request, cancellationToken);
    }

    public virtual IAsyncEnumerable<TResponse> CreateStream<TResponse>(IStreamRequest<TResponse> request, CancellationToken cancellationToken = new CancellationToken())
    {
        return Mediator.CreateStream(request, cancellationToken);
    }

    public virtual IAsyncEnumerable<object> CreateStream(object request, CancellationToken cancellationToken = new CancellationToken())
    {
        return Mediator.CreateStream(request, cancellationToken);
    }

    public virtual Task Publish(object notification, CancellationToken cancellationToken = new CancellationToken())
    {
        return Mediator.Publish(notification, cancellationToken);
    }

    public virtual Task Publish<TNotification>(TNotification notification, CancellationToken cancellationToken = new CancellationToken()) where TNotification : INotification
    {
        return Mediator.Publish(notification, cancellationToken);
    }
}