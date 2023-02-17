using System.Data;

namespace Sponsorkit.BusinessLogic.Domain.Mediatr.Behaviors.Database;

public interface IDatabaseTransactionRequest
{
    public IsolationLevel TransactionIsolationLevel { get; }
}