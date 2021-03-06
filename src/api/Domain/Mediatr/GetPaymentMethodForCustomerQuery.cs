using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Stripe;

namespace Sponsorkit.Domain.Mediatr;

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