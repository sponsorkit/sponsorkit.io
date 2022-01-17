using System;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Tests.TestHelpers.Builders.Stripe.Stripe;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Environments;

public class StripeEnvironmentContext
{
    private readonly IServiceProvider serviceProvider;

    public SubscriptionService SubscriptionService => serviceProvider.GetRequiredService<SubscriptionService>();
    public TestSubscriptionBuilder SubscriptionBuilder => new(SubscriptionService);

    public TestPlanBuilder PlanBuilder => new(serviceProvider.GetRequiredService<PlanService>());

    public CustomerService CustomerService => serviceProvider.GetRequiredService<CustomerService>();
    public TestCustomerBuilder CustomerBuilder => new(CustomerService);

    public TestPaymentMethodBuilder PaymentMethodBuilder => new(serviceProvider.GetRequiredService<PaymentMethodService>());

    public StripeEnvironmentContext(
        IServiceProvider serviceProvider)
    {
        this.serviceProvider = serviceProvider;
    }
}