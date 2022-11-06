using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Domain.Models;

public abstract class AsyncModelBuilder<TModel> : IAsyncModelBuilder<TModel> where TModel : class
{
    public abstract Task<TModel> BuildAsync(CancellationToken cancellationToken = default);
}