using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models.Context;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Signup.ActivateStripeAccountUserId
{
    public record Request(
        [FromRoute] Guid UserId);
    
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
        [HttpGet("/api/signup/activate-stripe-account/{userId}")]
        public override async Task<ActionResult> HandleAsync(Request request, CancellationToken cancellationToken = new())
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
                    RefreshUrl = $"https://sponsorkit.io/api/signup/activate-stripe-account/{request.UserId}",
                    ReturnUrl = $"https://sponsorkit.io/api/signup/completed",
                    Type = "account_onboarding"
                }, 
                cancellationToken: cancellationToken);
            return new RedirectResult(
                linkResponse.Url,
                true,
                false);
        }
    }
}