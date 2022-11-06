using Sponsorkit.Domain.Models.Stripe;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Builders.Stripe;

public class TestStripeCustomerBuilder : StripeCustomerBuilder
{
    public TestStripeCustomerBuilder(CustomerService customerService) : base(customerService)
    {
        WithEmail("integration-test@example.com");
    }
}