using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers;
using Sponsorkit.Domain.Models.Database.Context;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.SetupIntent;

public record GetRequest(
    string IntentId);

public record GetResponse(
    bool IsProcessed);
    
public class Get : EndpointBaseAsync
    .WithRequest<GetRequest>
    .WithActionResult<GetResponse>
{
    private readonly DataContext dataContext;
    private readonly SetupIntentService setupIntentService;
    private readonly IReadOnlyList<IStripeEventHandler<Stripe.SetupIntent>> setupIntentHandlers;

    public Get(
        DataContext dataContext,
        SetupIntentService setupIntentService,
        
        IEnumerable<IStripeEventHandler<Stripe.SetupIntent>> setupIntentHandlers)
    {
        this.dataContext = dataContext;
        this.setupIntentService = setupIntentService;
        this.setupIntentHandlers = setupIntentHandlers.ToArray();
    }
        
    [HttpGet("bounties/setup-intent/{intentId}")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override async Task<ActionResult<GetResponse>> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = default)
    {
        var userId = User.GetRequiredId();
            
        var matchingPayment = await dataContext.Payments
            .Include(x => x.Bounty)
            .SingleOrDefaultAsync(
                x => 
                    x.StripeId == request.IntentId &&
                    x.Bounty!.CreatorId == userId,
                cancellationToken);
        var isProcessed = matchingPayment != null;
        return new GetResponse(isProcessed);
    }
}