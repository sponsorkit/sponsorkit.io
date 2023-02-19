using System.Data;

namespace Sponsorkit.BusinessLogic.Domain.Mediatr.Behaviors;

public interface IDatabaseTransactionRequest
{
    public IsolationLevel TransactionIsolationLevel { get; }
}