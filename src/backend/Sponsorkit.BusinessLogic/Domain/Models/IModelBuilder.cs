namespace Sponsorkit.BusinessLogic.Domain.Models;

public interface IAsyncModelBuilder<TModel> where TModel : class
{
    public Task<TModel> BuildAsync(CancellationToken cancellationToken = default);
}