using System.Data;

namespace Sponsorkit.Domain.Mediatr.Behaviors.Database
{
    public interface IDatabaseTransactionRequest
    {
        public IsolationLevel TransactionIsolationLevel { get; }
    }
}
