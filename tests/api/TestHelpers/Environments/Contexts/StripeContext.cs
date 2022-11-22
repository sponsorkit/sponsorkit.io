using System;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Domain.Models.Stripe;
using Sponsorkit.Tests.TestHelpers.Builders.Stripe;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Environments.Contexts;

public class StripeContext
{
    private readonly IServiceProvider serviceProvider;

    public StripeSubscriptionBuilder SubscriptionBuilder => 
        new(serviceProvider.GetRequiredService<SubscriptionService>());
    
    public StripePlanBuilder PlanBuilder => 
        new(serviceProvider.GetRequiredService<PlanService>());

    public CustomerService CustomerService => serviceProvider.GetRequiredService<CustomerService>();
    public TestStripeCustomerBuilder CustomerBuilder => new(CustomerService);
    
    public TestStripeAccountBuilder AccountBuilder => new(
        serviceProvider.GetRequiredService<AccountService>(),
        serviceProvider.GetRequiredService<IMediator>());

    public StripePaymentMethodBuilder PaymentMethodBuilder => 
        new(serviceProvider.GetRequiredService<PaymentMethodService>());

    public StripeContext(
        IServiceProvider serviceProvider)
    {
        this.serviceProvider = serviceProvider;
    }
}