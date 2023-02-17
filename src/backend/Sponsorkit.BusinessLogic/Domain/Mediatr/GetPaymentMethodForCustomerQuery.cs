using MediatR;
using Stripe;

namespace Sponsorkit.BusinessLogic.Domain.Mediatr;

public record GetPaymentMethodForCustomerQuery(
    string CustomerId) : IRequest<PaymentMethod?>;
    
public class GetPaymentMethodForCustomerQueryHandler : IRequestHandler<GetPaymentMethodForCustomerQuery, PaymentMethod?>
{
    private readonly PaymentMethodService paymentMethodService;
    private readonly CustomerService customerService;

    public GetPaymentMethodForCustomerQueryHandler(
        PaymentMethodService paymentMethodService,
        CustomerService customerService)
    {
        this.paymentMethodService = paymentMethodService;
        this.customerService = customerService;
    }
        
    public async Task<PaymentMethod?> Handle(GetPaymentMethodForCustomerQuery request, CancellationToken cancellationToken)
    {
        var customer = await customerService.GetAsync(
            request.CustomerId,
            new CustomerGetOptions()
            {
                Expand = new ()
                {
                    "invoice_settings.default_payment_method"
                }
            },
            cancellationToken: cancellationToken);
        if (customer == null)
            throw new InvalidOperationException("The customer could not be found.");

        if (customer.InvoiceSettings?.DefaultPaymentMethod != null)
            return customer.InvoiceSettings.DefaultPaymentMethod;
            
        var paymentMethods = await paymentMethodService.ListAsync(
            new PaymentMethodListOptions()
            {
                Customer = request.CustomerId,
                Type = "card"
            },
            cancellationToken: cancellationToken);
            
        var paymentMethod = paymentMethods.FirstOrDefault();
        return paymentMethod;
    }
}