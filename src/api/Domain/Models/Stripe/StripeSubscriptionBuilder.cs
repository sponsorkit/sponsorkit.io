using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Stripe;

namespace Sponsorkit.Domain.Models.Stripe;

public class StripeSubscriptionBuilder : AsyncModelBuilder<Subscription>
{
    private readonly SubscriptionService subscriptionService;

    private Customer? customer;
    private PaymentMethod? paymentMethod;
    private Plan[]? plans;

    public StripeSubscriptionBuilder(
        SubscriptionService subscriptionService)
    {
        this.subscriptionService = subscriptionService;
    }

    public StripeSubscriptionBuilder WithCustomer(Customer customer)
    {
        this.customer = customer;
        return this;
    }

    public StripeSubscriptionBuilder WithDefaultPaymentMethod(PaymentMethod paymentMethod)
    {
        this.paymentMethod = paymentMethod;
        return this;
    }

    public StripeSubscriptionBuilder WithPlans(params Plan[] plans)
    {
        this.plans = plans;
        return this;
    }

    public override async Task<Subscription> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (customer == null)
            throw new InvalidOperationException("Customer must be set.");

        if (plans == null)
            throw new InvalidOperationException("Plans must be set.");
        
        var subscription = await subscriptionService.CreateAsync(
            new SubscriptionCreateOptions()
            {
                Customer = customer.Id,
                DefaultPaymentMethod = paymentMethod?.Id,
                Items = plans
                    .Select(plan => new SubscriptionItemOptions()
                    {
                        Plan = plan.Id
                    })
                    .ToList()
            },
            default,
            cancellationToken);

        return subscription;
    }
}