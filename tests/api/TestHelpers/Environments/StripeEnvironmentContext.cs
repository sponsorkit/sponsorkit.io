using System;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Domain.Models.Stripe;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Environments;

public class StripeEnvironmentContext
{
    private readonly IServiceProvider serviceProvider;

    public StripeSubscriptionBuilder SubscriptionBuilder => 
        new(serviceProvider.GetRequiredService<SubscriptionService>());
    
    public StripePlanBuilder PlanBuilder => 
        new(serviceProvider.GetRequiredService<PlanService>());

    public StripeCustomerBuilder CustomerBuilder => 
        new(serviceProvider.GetRequiredService<CustomerService>());

    public StripePaymentMethodBuilder PaymentMethodBuilder => 
        new(serviceProvider.GetRequiredService<PaymentMethodService>());

    public StripeEnvironmentContext(
        IServiceProvider serviceProvider)
    {
        this.serviceProvider = serviceProvider;
    }
}