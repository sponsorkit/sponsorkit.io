using Stripe;

namespace Sponsorkit.BusinessLogic.Domain.Models.Stripe;

public class StripePaymentMethodBuilder : AsyncModelBuilder<PaymentMethod>
{
    private readonly PaymentMethodService paymentMethodService;

    private Customer? customer;
    
    private int? expiryMonth;
    private int? expiryYear;
    
    private string? cvc;
    
    private string? cardNumber;

    public StripePaymentMethodBuilder(
        PaymentMethodService paymentMethodService)
    {
        this.paymentMethodService = paymentMethodService;
    }

    public StripePaymentMethodBuilder WithCustomer(Customer customer)
    {
        this.customer = customer;
        return this;
    }

    public StripePaymentMethodBuilder WithExpiry(int expiryMonth, int expiryYear)
    {
        this.expiryMonth = expiryMonth;
        this.expiryYear = expiryYear;
        return this;
    }

    public StripePaymentMethodBuilder WithCvc(string cvc)
    {
        this.cvc = cvc;
        return this;
    }

    public StripePaymentMethodBuilder WithCardNumber(string cardNumber)
    {
        this.cardNumber = cardNumber;
        return this;
    }

    public override async Task<PaymentMethod> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (cardNumber == null)
            throw new InvalidOperationException("Card number not specified.");

        if (cvc == null)
            throw new InvalidOperationException("CVC not specified.");

        if (expiryMonth == null || expiryYear == null)
            throw new InvalidOperationException("Expiry not specified.");
        
        var paymentMethod = await paymentMethodService.CreateAsync(
            new PaymentMethodCreateOptions()
            {
                Type = "card",
                Card = new PaymentMethodCardOptions()
                {
                    Cvc = cvc,
                    ExpMonth = expiryMonth,
                    ExpYear = expiryYear,
                    Number = cardNumber
                }
            },
            default,
            cancellationToken);

        if (customer != null)
        {
            await paymentMethodService.AttachAsync(
                paymentMethod.Id,
                new PaymentMethodAttachOptions()
                {
                    Customer = customer.Id
                },
                default,
                cancellationToken);
        }

        return paymentMethod;
    }
}