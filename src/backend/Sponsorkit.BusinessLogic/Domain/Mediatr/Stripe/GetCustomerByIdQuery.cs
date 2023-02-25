using System.Net;
using MediatR;
using Stripe;

namespace Sponsorkit.BusinessLogic.Domain.Mediatr.Stripe;

public record GetCustomerByIdQuery(string Id) : IRequest<Customer?>
{
    public bool IncludeDefaultPaymentMethod { get; init; }
}

public class GetCustomerByIdQueryHandler : IRequestHandler<GetCustomerByIdQuery, Customer?>
{
    private readonly CustomerService customerService;

    public GetCustomerByIdQueryHandler(
        CustomerService customerService)
    {
        this.customerService = customerService;
    }

    public async Task<Customer?> Handle(GetCustomerByIdQuery request, CancellationToken cancellationToken)
    {
        try
        {
            var expand = new[]
                {
                    request.IncludeDefaultPaymentMethod ? "invoice_settings.default_payment_method" : null
                }
                .Where(x => x != null)
                .ToList();
            
            var customer = await customerService.GetAsync(
                request.Id,
                new CustomerGetOptions()
                {
                    Expand = expand.Count > 0 ?
                        expand :
                        null
                },
                cancellationToken: cancellationToken);
            return customer;
        }
        catch (StripeException ex) when (ex.HttpStatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }
}