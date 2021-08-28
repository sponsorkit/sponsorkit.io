using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Models.Context;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Account.StripeConnect.Activate
{
    public record Request(
        Guid UserId);
    
    public class Get : BaseAsyncEndpoint
        .WithRequest<Request>
        .WithoutResponse
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

        [AllowAnonymous]
        [HttpGet("/account/stripe-connect/activate/{userId}")]
        public override async Task<ActionResult> HandleAsync([FromRoute] Request request, CancellationToken cancellationToken = new())
        {
            var accountId = await dataContext.Users
                .AsQueryable()
                .Where(x => x.Id == request.UserId)
                .Select(x => x.StripeConnectId)
                .SingleOrDefaultAsync(cancellationToken);
            
            var linkResponse = await accountLinkService.CreateAsync(
                new AccountLinkCreateOptions()
                {
                    Account = accountId,
                    RefreshUrl = LinkHelper.GetApiUrl($"/account/stripe-connect/activate/{request.UserId}"),
                    ReturnUrl = LinkHelper.GetWebUrl($"/signup/completed"),
                    Type = "account_onboarding"
                }, 
                cancellationToken: cancellationToken);
            return new RedirectResult(
                linkResponse.Url,
                false,
                false);
        }
    }
}