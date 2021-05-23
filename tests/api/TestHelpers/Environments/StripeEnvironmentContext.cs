using System;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Tests.TestHelpers.Builders.Stripe.Stripe;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Environments
{
    public class StripeEnvironmentContext
    {
        private readonly IServiceProvider serviceProvider;

        public SubscriptionService SubscriptionService => this.serviceProvider.GetRequiredService<SubscriptionService>();
        public TestSubscriptionBuilder SubscriptionBuilder => new TestSubscriptionBuilder(SubscriptionService);

        public TestPlanBuilder PlanBuilder => new TestPlanBuilder(this.serviceProvider.GetRequiredService<PlanService>());

        public CustomerService CustomerService => this.serviceProvider.GetRequiredService<CustomerService>();
        public TestCustomerBuilder CustomerBuilder => new TestCustomerBuilder(CustomerService);

        public TestPaymentMethodBuilder PaymentMethodBuilder => new TestPaymentMethodBuilder(this.serviceProvider.GetRequiredService<PaymentMethodService>());

        public StripeEnvironmentContext(
            IServiceProvider serviceProvider)
        {
            this.serviceProvider = serviceProvider;
        }
    }
}
