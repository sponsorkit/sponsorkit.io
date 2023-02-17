using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Builders.Stripe;

public class TestStripeCustomerBuilder : StripeCustomerBuilder
{
    private TestStripeAccountBuilder stripeAccountBuilder;

    public TestStripeCustomerBuilder(
        CustomerService customerService) : base(customerService)
    {
        WithEmail("integration-test@example.com");
    }

    public TestStripeCustomerBuilder WithAccount(TestStripeAccountBuilder stripeAccountBuilder)
    {
        this.stripeAccountBuilder = stripeAccountBuilder;
        return this;
    }

    public override async Task<Customer> BuildAsync(CancellationToken cancellationToken = default)
    {
        var customer = await base.BuildAsync(cancellationToken);
        
        if (stripeAccountBuilder != null)
        {
            CreatedAccount = await stripeAccountBuilder
                .WithCustomerId(customer.Id)
                .WithEmail(customer.Email)
                .BuildAsync(cancellationToken);
        }
        
        return customer;
    }
}