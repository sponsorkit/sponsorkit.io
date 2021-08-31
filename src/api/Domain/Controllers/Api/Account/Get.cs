using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.Security.Encryption;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Account
{
    public record BeneficiaryResponse(
        bool IsAccountComplete,
        string? GitHubUsername);

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
        private readonly AccountService accountService;

        public Get(
            IAesEncryptionHelper encryptionHelper,
            DataContext dataContext,
            CustomerService customerService,
            PaymentMethodService paymentMethodService,
            AccountService accountService)
        {
            this.encryptionHelper = encryptionHelper;
            this.dataContext = dataContext;
            this.customerService = customerService;
            this.paymentMethodService = paymentMethodService;
            this.accountService = accountService;
        }
        
        [HttpGet("/account")]
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
                await GetBeneficiaryResponseAsync(user),
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

        private async Task<BeneficiaryResponse?> GetBeneficiaryResponseAsync(User user)
        {
            if (user.StripeConnectId == null)
                return null;

            var account = await accountService.GetAsync(user.StripeConnectId);
            if (account == null)
                throw new Exception("Expected account to be present.");
            
            return new BeneficiaryResponse(
                account.DetailsSubmitted,
                user.GitHub?.Username);
        }
    }
}