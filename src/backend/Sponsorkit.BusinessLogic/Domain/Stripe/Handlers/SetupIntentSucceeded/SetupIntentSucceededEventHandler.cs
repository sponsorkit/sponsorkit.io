using Stripe;

namespace Sponsorkit.BusinessLogic.Domain.Stripe.Handlers.SetupIntentSucceeded;

public class SetupIntentSucceededEventHandler : StripeEventHandler<SetupIntent>
{
    private readonly CustomerService customerService;

    public SetupIntentSucceededEventHandler(
        CustomerService customerService)
    {
        this.customerService = customerService;
    }

    protected override bool CanHandleWebhookType(string type)
    {
        return type == Events.SetupIntentSucceeded;
    }

    protected override bool CanHandleData(SetupIntent data)
    {
        return data.Status == "succeeded";
    }

    protected override async Task HandleAsync(string eventId, SetupIntent data, CancellationToken cancellationToken)
    {
        await SetPaymentMethodAsDefaultAsync(data, cancellationToken);
    }

    private async Task SetPaymentMethodAsDefaultAsync(SetupIntent data, CancellationToken cancellationToken)
    {
        await customerService.UpdateAsync(
            data.CustomerId,
            new CustomerUpdateOptions()
            {
                InvoiceSettings = new CustomerInvoiceSettingsOptions()
                {
                    DefaultPaymentMethod = data.PaymentMethodId
                }
            },
            cancellationToken: cancellationToken);
    }
}