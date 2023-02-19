using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;

namespace Sponsorkit.Tests.BusinessLogic.Domain.Mediatr;

public interface IFakeMediatorInterceptor
{
    void Intercept(IRequest request);
    void Intercept<TResponse>(IRequest<TResponse> request);
}

public class InterceptorBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse> where TRequest : notnull
{
    private readonly IFakeMediatorInterceptor interceptor;

    public InterceptorBehavior(
        IFakeMediatorInterceptor interceptor)
    {
        this.interceptor = interceptor;
    }

    public Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        if (request is IRequest)
        {
            interceptor.Intercept((IRequest)request);
        } else if (request.GetType().GetGenericTypeDefinition() == typeof(IRequest<>))
        {
            interceptor.Intercept((IRequest<TResponse>)request);
        }
        else
        {
            throw new InvalidOperationException($"Interceptor does not support request type {request.GetType()}");
        }

        return next();
    }
}