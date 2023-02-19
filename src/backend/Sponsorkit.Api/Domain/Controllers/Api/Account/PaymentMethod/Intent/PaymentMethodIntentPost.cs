using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.BusinessLogic.Domain.Mediatr.Stripe;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe.Metadata;
using Sponsorkit.BusinessLogic.Infrastructure.AspNet;

namespace Sponsorkit.Api.Domain.Controllers.Api.Account.PaymentMethod.Intent;

public record PostResponse(
    string PaymentIntentClientSecret,
    string? ExistingPaymentMethodId);

public class PaymentMethodIntentPost : EndpointBaseAsync
    .WithoutRequest
    .WithActionResult<PostResponse>
{
    private readonly DataContext dataContext;
    private readonly StripeSetupIntentBuilder setupIntentBuilder;
    
    private readonly IMediator mediator;

    public PaymentMethodIntentPost(
        DataContext dataContext,
        StripeSetupIntentBuilder setupIntentBuilder,
        IMediator mediator)
    {
        this.dataContext = dataContext;
        this.setupIntentBuilder = setupIntentBuilder;
        this.mediator = mediator;
    }
        
    [HttpPost("account/payment-method/intent")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override async Task<ActionResult<PostResponse>> HandleAsync(CancellationToken cancellationToken = default)
    {
        var userId = User.GetRequiredId();
        var user = await dataContext.Users.SingleAsync(
            x => x.Id == userId,
            cancellationToken);
            
        var paymentMethod = await mediator.Send(
            new GetPaymentMethodForCustomerQuery(user.StripeCustomerId),
            cancellationToken);

        var intent = await setupIntentBuilder
            .WithUser(user)
            .WithPaymentMethod(paymentMethod)
            .WithIdempotencyKey(Guid.NewGuid().ToString())
            .WithMetadata(new StripeAccountPaymentIntentMetadataBuilder())
            .BuildAsync(cancellationToken);

        return new PostResponse(
            intent.ClientSecret,
            paymentMethod?.Id);
    }
}