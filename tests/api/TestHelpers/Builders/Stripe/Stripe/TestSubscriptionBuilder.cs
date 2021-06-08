using System.Linq;
using System.Threading.Tasks;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Builders.Stripe.Stripe
{
    public class TestSubscriptionBuilder
    {
        private readonly SubscriptionService subscriptionService;

        private Customer customer;
        private PaymentMethod paymentMethod;
        private Plan[] plans;

        private bool shouldCancel;

        public TestSubscriptionBuilder(
            SubscriptionService subscriptionService)
        {
            this.subscriptionService = subscriptionService;
        }

        public TestSubscriptionBuilder WithCustomer(Customer customer)
        {
            this.customer = customer;
            return this;
        }

        public TestSubscriptionBuilder WithDefaultPaymentMethod(PaymentMethod paymentMethod)
        {
            this.paymentMethod = paymentMethod;
            return this;
        }

        public TestSubscriptionBuilder WithPlans(params Plan[] plans)
        {
            this.plans = plans;
            return this;
        }

        public TestSubscriptionBuilder WithCanceledState()
        {
            shouldCancel = true;
            return this;
        }

        public async Task<Subscription> BuildAsync()
        {
            var subscription = await subscriptionService.CreateAsync(new SubscriptionCreateOptions()
            {
                Customer = customer.Id,
                DefaultPaymentMethod = paymentMethod?.Id,
                Items = plans
                    .Select(plan => new SubscriptionItemOptions()
                    {
                        Plan = plan.Id
                    })
                    .ToList()
            });

            if (shouldCancel)
            {
                await subscriptionService.CancelAsync(subscription.Id, new SubscriptionCancelOptions());
            }

            return subscription;
        }
    }
}
