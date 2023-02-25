using Sponsorkit.BusinessLogic.Domain.Helpers;

namespace Sponsorkit.BusinessLogic.Domain.Models.Stripe.Metadata;

public class StripeAccountPaymentIntentMetadataBuilder : IStripeMetadataBuilder
{
    public string Type => UniversalMetadataTypes.PaymentMethodUpdateSetupIntent;
    
    public IDictionary<string, string> Build()
    {
        return new Dictionary<string, string>();
    }
}