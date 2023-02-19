using MediatR;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;

namespace Sponsorkit.BusinessLogic.Domain.Mediatr.Behaviors.Database;

public class DatabaseTransactionBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly DataContext dataContext;

    public DatabaseTransactionBehavior(
        DataContext dataContext)
    {
        this.dataContext = dataContext;
    }

    public async Task<TResponse> Handle(
        TRequest request, 
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (request is not IDatabaseTransactionRequest databaseTransactionRequest)
            return await next();

        return await dataContext.ExecuteInTransactionAsync(
            async () => await next(),
            databaseTransactionRequest.TransactionIsolationLevel);
    }
}