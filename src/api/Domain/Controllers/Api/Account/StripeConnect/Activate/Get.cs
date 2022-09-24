using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Account.StripeConnect.Activate;

public record Response(
    string Url);
    
public class Get : EndpointBaseAsync
    .WithoutRequest
    .WithActionResult<Response>
{
    private readonly AccountLinkService accountLinkService;
    private readonly DataContext dataContext;

    public Get(
        AccountLinkService accountLinkService,
        DataContext dataContext)
    {
        this.accountLinkService = accountLinkService;
        this.dataContext = dataContext;
    }

    [HttpGet("account/stripe-connect/activate")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override async Task<ActionResult<Response>> HandleAsync(CancellationToken cancellationToken = new())
    {
        var userId = User.GetRequiredId();
            
        var accountId = await dataContext.Users
            .AsQueryable()
            .Where(x => x.Id == userId)
            .Select(x => x.StripeConnectId)
            .SingleOrDefaultAsync(cancellationToken);
            
        var linkResponse = await accountLinkService.CreateAsync(
            new AccountLinkCreateOptions()
            {
                Account = accountId,
                RefreshUrl = LinkHelper.GetWebUrl($"/landing/stripe-connect/activate"),
                ReturnUrl = LinkHelper.GetWebUrl($"/landing/stripe-connect/activated"),
                Type = "account_onboarding"
            }, 
            cancellationToken: cancellationToken);
        return new Response(
            linkResponse.Url);
    }
}