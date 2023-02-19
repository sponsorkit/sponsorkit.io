using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.BusinessLogic.Domain.Mediatr.Stripe;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.BusinessLogic.Infrastructure.AspNet;

namespace Sponsorkit.Api.Domain.Controllers.Api.Account.StripeConnect.Activate;

public record Request(
    [FromQuery] Guid BroadcastId);

public record Response(
    string Url);
    
public class ActivateGet : EndpointBaseAsync
    .WithRequest<Request>
    .WithActionResult<Response>
{
    private readonly DataContext dataContext;
    private readonly IMediator mediator;

    public ActivateGet(
        DataContext dataContext,
        IMediator mediator)
    {
        this.dataContext = dataContext;
        this.mediator = mediator;
    }

    [HttpGet("account/stripe-connect/activate")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override async Task<ActionResult<Response>> HandleAsync([FromRoute] Request request, CancellationToken cancellationToken = new())
    {
        var userId = User.GetRequiredId();
            
        var accountId = await dataContext.Users
            .AsQueryable()
            .Where(x => x.Id == userId)
            .Select(x => x.StripeConnectId)
            .SingleOrDefaultAsync(cancellationToken);
        if (accountId == null)
            return BadRequest("The user does not have a stripe account.");
            
        var linkResponse = await mediator.Send(
            new CreateStripeConnectActivationLinkCommand(
                accountId,
                request.BroadcastId),
            cancellationToken);
        return new Response(
            linkResponse.Url);
    }
}