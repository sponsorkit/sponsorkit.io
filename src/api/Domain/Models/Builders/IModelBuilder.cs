namespace Sponsorkit.Domain.Models.Builders;

public interface IModelBuilder<out TModel> where TModel : class
{
    public TModel Build();
}