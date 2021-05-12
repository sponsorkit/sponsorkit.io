using System;
using System.Threading.Tasks;
using AutoMapper;
using MediatR;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Sponsorkit.Domain.Models;
using Stripe;

namespace Sponsorkit.Domain.Api.Sponsors.SponsorsBeneficiaryReferencePost
{
    public class Function
    {
        private readonly IMediator mediator;
        private readonly IMapper mapper;
        
        private readonly CustomerService customerService;
        private readonly PaymentMethodService paymentMethodService;
        private readonly ChargeService chargeService;
        private readonly DataContext dataContext;

        public Function(
            IMediator mediator,
            IMapper mapper,
            CustomerService customerService,
            PaymentMethodService paymentMethodService,
            ChargeService chargeService,
            DataContext dataContext)
        {
            this.mediator = mediator;
            this.mapper = mapper;
            this.customerService = customerService;
            this.paymentMethodService = paymentMethodService;
            this.chargeService = chargeService;
            this.dataContext = dataContext;
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
            // if (!Guid.TryParse(beneficiary, out var beneficiaryId))
            //     return await request.CreateBadRequestResponseAsync("Invalid beneficiary ID.");
            //
            // var requestObject = await request.ReadFromJsonAsync<Request>();
            // if (requestObject?.Email == null)
            //     return await request.CreateBadRequestResponseAsync("E-mail address not specified.");
            //
            // if (requestObject.AmountInHundreds == null)
            //     return await request.CreateBadRequestResponseAsync("Amount not specified.");
            //
            // if (requestObject.StripeCardId == null)
            //     return await request.CreateBadRequestResponseAsync("Stripe card ID not specified.");
            //
            // //TODO: we should create the sign-up function first.
            //
            // var customersByEmail = await customerService.ListAsync(new CustomerListOptions()
            // {
            //     Email = requestObject.Email
            // });
            //
            //
            // var customer = 
            //     customersByEmail.SingleOrDefault() ?? 
            //     await customerService.CreateAsync(new CustomerCreateOptions()
            //     {
            //         Email = requestObject.Email
            //     });
            //
            // var user = new User()
            // {
            //     StripeCustomerId = customer.Id,
            //     CreatedAtUtc = DateTime.UtcNow,
            //     EncryptedEmail = requestObject.Email
            // };
            //
            // var beneficiaryUser = await dataContext.Users.SingleAsync(x => x.Id == beneficiaryId);
            // var sponsorship = new Sponsorship()
            // {
            //     Beneficiary = beneficiaryUser,
            //     Sponsor = user,
            //     MonthlyAmountInHundreds = requestObject.AmountInHundreds,
            //     CreatedAtUtc = DateTime.UtcNow
            // };
            //
            // var payment = new Payment()
            // {
            //     Sponsorship = sponsorship,
            //     CreatedAtUtc = DateTime.UtcNow,
            //     AmountInHundreds = requestObject.AmountInHundreds.Value
            // };
            //
            // var existingPaymentMethods = await paymentMethodService
            //     .ListAutoPagingAsync(
            //         new PaymentMethodListOptions()
            //         {
            //             Customer = customer.Id,
            //             Type = "card"
            //         })
            //     .ToListAsync();
            //
            // await paymentMethodService.AttachAsync(
            //     requestObject.StripeCardId,
            //     new PaymentMethodAttachOptions()
            //     {
            //         Customer = customer.Id
            //     });
            //
            // await customerService.UpdateAsync(customer.Id, new CustomerUpdateOptions()
            // {
            //     InvoiceSettings = new CustomerInvoiceSettingsOptions()
            //     {
            //         DefaultPaymentMethod = requestObject.StripeCardId
            //     }
            // });
            //
            // foreach (var oldPaymentMethod in existingPaymentMethods)
            // {
            //     await paymentMethodService.DetachAsync(
            //         oldPaymentMethod.Id);
            // }
            //
            // await chargeService.CreateAsync(new ChargeCreateOptions()
            // {
            //     Amount = requestObject.AmountInHundreds,
            //     ApplicationFeeAmount = 100,
            //     Capture = true,
            //     Currency = "usd",
            //     Customer = customer.Id
            // });
            //
            // return await request.CreateOkResponseAsync();

            throw new NotImplementedException();
        }
    }
}
