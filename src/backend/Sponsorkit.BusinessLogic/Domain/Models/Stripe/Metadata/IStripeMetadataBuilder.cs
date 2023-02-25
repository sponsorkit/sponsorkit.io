namespace Sponsorkit.BusinessLogic.Domain.Models.Stripe.Metadata;

public interface IStripeMetadataBuilder
{
    public string Type { get; }
    public IDictionary<string, string> Build();
}