﻿using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.BusinessLogic.Infrastructure.AspNet;

namespace Sponsorkit.Api.Domain.Controllers.Api.Bounties.SetupIntent;

public record GetRequest(
    string IntentId);

public record GetResponse(
    bool IsProcessed);
    
public class SetupIntentGet : EndpointBaseAsync
    .WithRequest<GetRequest>
    .WithActionResult<GetResponse>
{
    private readonly DataContext dataContext;

    public SetupIntentGet(
        DataContext dataContext)
    {
        this.dataContext = dataContext;
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