using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.BusinessLogic.Domain.Mediatr.Stripe;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.BusinessLogic.Infrastructure.AspNet;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Encryption;
using Stripe;

namespace Sponsorkit.Api.Domain.Controllers.Api.Account;

public record BeneficiaryResponse(
    bool IsAccountComplete);

public record CreditCardResponse(
    string LastFourDigits,
    string Brand);

public record SponsorResponse(
    CreditCardResponse? CreditCard);

public record Response(
    string Email,
    string? GitHubUsername,
    bool IsEmailVerified,
    BeneficiaryResponse? Beneficiary,
    SponsorResponse? Sponsor);
    
public class AccountGet : EndpointBaseAsync
    .WithoutRequest
    .WithActionResult<Response>
{
    private readonly IEncryptionHelper encryptionHelper;
    private readonly IMediator mediator;

    private readonly DataContext dataContext;
    private readonly PaymentMethodService paymentMethodService;
    private readonly AccountService accountService;

    public AccountGet(
        IEncryptionHelper encryptionHelper,
        IMediator mediator,
        DataContext dataContext,
        PaymentMethodService paymentMethodService,
        AccountService accountService)
    {
        this.encryptionHelper = encryptionHelper;
        this.mediator = mediator;
        this.dataContext = dataContext;
        this.paymentMethodService = paymentMethodService;
        this.accountService = accountService;
    }
        
    [HttpGet("account")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override async Task<ActionResult<Response>> HandleAsync(CancellationToken cancellationToken = new())
    {
        var userId = User.GetRequiredId();
            
        var user = await dataContext.Users.SingleAsync(
            x => x.Id == userId,
            cancellationToken);

        var stripeCustomer = await mediator.Send(
            new GetCustomerByIdQuery(user.StripeCustomerId),
            cancellationToken: cancellationToken);
        if (stripeCustomer == null || stripeCustomer.Deleted == true)
            return NoContent();

        var paymentMethod = await GetPaymentMethodAsync(stripeCustomer, cancellationToken);

        var email = await encryptionHelper.DecryptAsync(user.EncryptedEmail);

        return Ok(new Response(
            email,
            user.GitHub?.Username,
            user.EmailVerifiedAt != null,
            await GetBeneficiaryResponseAsync(user, cancellationToken),
            GetSponsorResponse(paymentMethod)));
    }

    private async Task<Stripe.PaymentMethod?> GetPaymentMethodAsync(
        Customer stripeCustomer, 
        CancellationToken cancellationToken)
    {
        var paymentMethodId = stripeCustomer.InvoiceSettings?.DefaultPaymentMethodId;
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

    private async Task<BeneficiaryResponse?> GetBeneficiaryResponseAsync(User user, CancellationToken cancellationToken)
    {
        if (user.StripeConnectId == null)
            return null;
        
        var account = await accountService.GetAsync(
            user.StripeConnectId, 
            default, 
            default, 
            cancellationToken);
        if (account == null)
            throw new Exception("Expected account to be present.");
            
        return new BeneficiaryResponse(
            account.DetailsSubmitted);
    }
}