using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.Encryption;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Account
{
    public record BeneficiaryResponse();

    public record CreditCardResponse(
        string LastFourDigits,
        string Brand);

    public record SponsorResponse(
        CreditCardResponse? CreditCard);

    public record Response(
        string Email,
        bool IsEmailVerified,
        BeneficiaryResponse? Beneficiary,
        SponsorResponse? Sponsor);
    
    public class Get : BaseAsyncEndpoint
        .WithoutRequest
        .WithResponse<Response>
    {
        private readonly IAesEncryptionHelper encryptionHelper;
        
        private readonly DataContext dataContext;
        private readonly CustomerService customerService;
        private readonly PaymentMethodService paymentMethodService;

        public Get(
            IAesEncryptionHelper encryptionHelper,
            DataContext dataContext,
            CustomerService customerService,
            PaymentMethodService paymentMethodService)
        {
            this.encryptionHelper = encryptionHelper;
            this.dataContext = dataContext;
            this.customerService = customerService;
            this.paymentMethodService = paymentMethodService;
        }
        
        [HttpGet("/api/account")]
        public override async Task<ActionResult<Response>> HandleAsync(CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetRequiredId();
            
            var user = await dataContext.Users.SingleAsync(
                x => x.Id == userId,
                cancellationToken);

            var stripeCustomer = await customerService.GetAsync(
                user.StripeCustomerId, 
                cancellationToken: cancellationToken);
            if (stripeCustomer == null)
                throw new InvalidOperationException("User did not have a Stripe customer ID.");

            var paymentMethod = await GetPaymentMethodAsync(stripeCustomer, cancellationToken);

            var email = await encryptionHelper.DecryptAsync(user.EncryptedEmail);

            return Ok(new Response(
                email,
                user.EmailVerifiedAtUtc != null,
                GetBeneficiaryResponse(user),
                GetSponsorResponse(paymentMethod)));
        }

        private async Task<Stripe.PaymentMethod?> GetPaymentMethodAsync(
            Customer stripeCustomer, 
            CancellationToken cancellationToken)
        {
            var paymentMethodId = stripeCustomer.InvoiceSettings.DefaultPaymentMethodId;
            var paymentMethod = paymentMethodId != null
                ? await paymentMethodService.GetAsync(
                    paymentMethodId,
                    cancellationToken: cancellationToken)
                : null;
            return paymentMethod;
        }

        private static SponsorResponse GetSponsorResponse(Stripe.PaymentMethod? paymentMethod)
        {
            var creditCard = paymentMethod?.Card != null ?
                new CreditCardResponse(
                    paymentMethod.Card.Last4,
                    paymentMethod.Card.Brand) :
                null;
            return new SponsorResponse(
                creditCard);
        }

        private static BeneficiaryResponse? GetBeneficiaryResponse(User user)
        {
            return user.StripeConnectId == null ?
                null :
                new BeneficiaryResponse();
        }
    }
}