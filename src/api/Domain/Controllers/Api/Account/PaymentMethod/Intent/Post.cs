using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Ardalis.Result;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Controllers.Api.Bounties;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Account.PaymentMethod.Intent;

public record PostResponse(
    string PaymentIntentClientSecret,
    string? ExistingPaymentMethodId);

public class Post : EndpointBaseAsync
    .WithoutRequest
    .WithActionResult<PostResponse>
{
    private readonly DataContext dataContext;
    private readonly SetupIntentService setupIntentService;
    private readonly IMediator mediator;

    public Post(
        DataContext dataContext,
        SetupIntentService setupIntentService,
        IMediator mediator)
    {
        this.dataContext = dataContext;
        this.setupIntentService = setupIntentService;
        this.mediator = mediator;
    }
        
    [HttpPost("/account/payment-method/intent")]
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

        var intent = await setupIntentService.CreateAsync(
            new SetupIntentCreateOptions()
            {
                Confirm = false,
                Customer = user.StripeCustomerId,
                PaymentMethod = paymentMethod?.Id,
                Usage = "off_session",
                Metadata = new Dictionary<string, string>()
                {
                    { UniversalMetadataKeys.Type, UniversalMetadataTypes.PaymentMethodUpdateSetupIntent }
                }
            },
            cancellationToken: cancellationToken);

        return new PostResponse(
            intent.ClientSecret,
            paymentMethod?.Id);
    }
}