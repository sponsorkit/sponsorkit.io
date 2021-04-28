using System;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using MediatR;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Sponsorkit.Infrastructure;
using Stripe;

namespace Sponsorkit.Domain.Api.Sponsors.SponsorsBeneficiaryReferencePost
{
    public class SponsorsBeneficiaryReferencePost
    {
        private readonly IMediator _mediator;
        private readonly IMapper _mapper;
        
        private readonly CustomerService _customerService;
        private readonly PaymentMethodService _paymentMethodService;
        private readonly ChargeService _chargeService;

        public SponsorsBeneficiaryReferencePost(
            IMediator mediator,
            IMapper mapper,
            CustomerService customerService,
            PaymentMethodService paymentMethodService,
            ChargeService chargeService)
        {
            _mediator = mediator;
            _mapper = mapper;
            _customerService = customerService;
            _paymentMethodService = paymentMethodService;
            _chargeService = chargeService;
        }

        /// <summary>
        /// <see cref="http://localhost:7071/api/sponsors/681c2d58-7a3f-49fb-ada8-697c06708d32/sponsorship-foo"/>
        /// </summary>
        [Function(nameof(SponsorsBeneficiaryReferencePost))]
        public async Task<HttpResponseData> Execute(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "sponsors/{beneficiary}/{reference}")] 
            HttpRequestData request,
            string beneficiary,
            string reference)
        {
            if (!Guid.TryParse(beneficiary, out var beneficiaryId))
                return await request.CreateBadRequestResponseAsync("Invalid beneficiary ID.");

            var requestObject = await request.ReadFromJsonAsync<Request>();
            if (requestObject?.Email == null)
                return await request.CreateBadRequestResponseAsync("E-mail address not specified.");
            
            if (requestObject.AmountInHundreds == null)
                return await request.CreateBadRequestResponseAsync("Amount not specified.");
            
            if (requestObject.StripeCardId == null)
                return await request.CreateBadRequestResponseAsync("Stripe card ID not specified.");

            var customersByEmail = await _customerService.ListAsync(new CustomerListOptions()
            {
                Email = requestObject.Email
            });
            
            var customer = 
                customersByEmail.SingleOrDefault() ?? 
                await _customerService.CreateAsync(new CustomerCreateOptions()
                {
                    Email = requestObject.Email
                });

            var existingPaymentMethods = await _paymentMethodService
                .ListAutoPagingAsync(
                    new PaymentMethodListOptions()
                    {
                        Customer = customer.Id,
                        Type = "card"
                    })
                .ToListAsync();

            await _paymentMethodService.AttachAsync(
                requestObject.StripeCardId,
                new PaymentMethodAttachOptions()
                {
                    Customer = customer.Id
                });

            await _customerService.UpdateAsync(customer.Id, new CustomerUpdateOptions()
            {
                InvoiceSettings = new CustomerInvoiceSettingsOptions()
                {
                    DefaultPaymentMethod = requestObject.StripeCardId
                }
            });

            foreach (var oldPaymentMethod in existingPaymentMethods)
            {
                await _paymentMethodService.DetachAsync(
                    oldPaymentMethod.Id);
            }

            await _chargeService.CreateAsync(new ChargeCreateOptions()
            {
                Amount = requestObject.AmountInHundreds,
                ApplicationFeeAmount = 100,
                Capture = true,
                Currency = "usd",
                Customer = customer.Id
            });

            return await request.CreateOkResponseAsync();
        }
    }
}
