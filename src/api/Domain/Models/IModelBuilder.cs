using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Domain.Models;

public interface IAsyncModelBuilder<TModel> where TModel : class
{
    public Task<TModel> BuildAsync(CancellationToken cancellationToken = default);
}