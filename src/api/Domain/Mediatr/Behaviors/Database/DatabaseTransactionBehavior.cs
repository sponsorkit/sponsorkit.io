using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Sponsorkit.Domain.Models.Context;

namespace Sponsorkit.Domain.Mediatr.Behaviors.Database;

public class DatabaseTransactionBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    private readonly DataContext dataContext;

    public DatabaseTransactionBehavior(
        DataContext dataContext)
    {
        this.dataContext = dataContext;
    }

    public async Task<TResponse> Handle(
        TRequest request, 
        CancellationToken cancellationToken, 
        RequestHandlerDelegate<TResponse> next)
    {
        if (request is not IDatabaseTransactionRequest databaseTransactionRequest)
            return await next();

        return await dataContext.ExecuteInTransactionAsync(
            async () => await next(),
            databaseTransactionRequest.TransactionIsolationLevel);
    }
}