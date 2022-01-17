using System.Threading.Tasks;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Builders.Stripe.Stripe;

public class TestPaymentMethodBuilder
{
    private readonly PaymentMethodService paymentMethodService;

    private Customer customer;

    public TestPaymentMethodBuilder(
        PaymentMethodService paymentMethodService)
    {
        this.paymentMethodService = paymentMethodService;
    }

    public TestPaymentMethodBuilder WithCustomer(Customer customer)
    {
        this.customer = customer;
        return this;
    }

    public async Task<PaymentMethod> BuildAsync()
    {
        var paymentMethod = await paymentMethodService.CreateAsync(new PaymentMethodCreateOptions()
        {
            Type = "card",
            Card = new PaymentMethodCardOptions()
            {
                Cvc = "123",
                ExpMonth = 11,
                ExpYear = 2030,
                Number = "4242424242424242"
            }
        });

        if (customer != null)
        {
            await paymentMethodService.AttachAsync(
                paymentMethod.Id,
                new PaymentMethodAttachOptions()
                {
                    Customer = customer.Id
                });
        }

        return paymentMethod;
    }
}