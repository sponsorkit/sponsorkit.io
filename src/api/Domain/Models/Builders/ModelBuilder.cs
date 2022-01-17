namespace Sponsorkit.Domain.Models.Builders;

public abstract class ModelBuilder<TModel> : IModelBuilder<TModel> where TModel : class
{
    public abstract TModel Build();

    public static implicit operator TModel(ModelBuilder<TModel> builder)
    {
        return builder.Build();
    }
}