using System.Collections.Generic;
using Sponsorkit.Domain.Helpers;

namespace Sponsorkit.Domain.Models.Stripe.Metadata;

public class StripeAccountPaymentIntentMetadataBuilder : IStripeMetadataBuilder
{
    public string Type => UniversalMetadataTypes.PaymentMethodUpdateSetupIntent;
    
    public IDictionary<string, string> Build()
    {
        return new Dictionary<string, string>();
    }
}