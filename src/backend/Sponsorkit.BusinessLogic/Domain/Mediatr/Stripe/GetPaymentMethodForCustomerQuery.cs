using MediatR;
using Stripe;

namespace Sponsorkit.BusinessLogic.Domain.Mediatr.Stripe;

public record GetPaymentMethodForCustomerQuery(
    string CustomerId) : IRequest<PaymentMethod?>;
    
public class GetPaymentMethodForCustomerQueryHandler : IRequestHandler<GetPaymentMethodForCustomerQuery, PaymentMethod?>
{
    private readonly PaymentMethodService paymentMethodService;
    private readonly IMediator mediator;

    public GetPaymentMethodForCustomerQueryHandler(
        PaymentMethodService paymentMethodService,
        IMediator mediator)
    {
        this.paymentMethodService = paymentMethodService;
        this.mediator = mediator;
    }
        
    public async Task<PaymentMethod?> Handle(GetPaymentMethodForCustomerQuery request, CancellationToken cancellationToken)
    {
        var customer = await mediator.Send(
            new GetCustomerByIdQuery(request.CustomerId),
            cancellationToken);
        
        if(customer == null)
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