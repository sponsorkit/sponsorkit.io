using System.Threading;
using System.Threading.Tasks;
using MediatR;

namespace Sponsorkit.Tests.Domain.Mediatr;

public interface IFakeMediatorInterceptor
{
    void Intercept<TResponse>(IRequest<TResponse> request);
}

public class InterceptorBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse> where TRequest : IRequest<TResponse>
{
    private readonly IFakeMediatorInterceptor interceptor;

    public InterceptorBehavior(
        IFakeMediatorInterceptor interceptor)
    {
        this.interceptor = interceptor;
    }

    public Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        interceptor.Intercept(request);
        return next();
    }
}