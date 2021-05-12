using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure;
using Stripe;

namespace Sponsorkit.Domain.Api.Signup.SignupActivateStripeAccountGet
{
    public class Function
    {
        private readonly AccountLinkService accountLinkService;
        private readonly DataContext dataContext;

        public Function(
            AccountLinkService accountLinkService,
            DataContext dataContext)
        {
            this.accountLinkService = accountLinkService;
            this.dataContext = dataContext;
        }

        [Function(nameof(SignupActivateStripeAccountGet))]
        public async Task<HttpResponseData?> Execute(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "signup/activate-stripe-account/{user}")]
            HttpRequestData requestData,
            string user)
        {
            if (!Guid.TryParse(user, out var userId))
                return await requestData.CreateBadRequestResponseAsync("Invalid user ID.");
            
            var accountId = await dataContext.Users
                .AsQueryable()
                .Where(x => x.Id == userId)
                .Select(x => x.StripeConnectId)
                .SingleOrDefaultAsync();
            
            var linkResponse = await accountLinkService.CreateAsync(
                new AccountLinkCreateOptions()
                {
                    Account = accountId,
                    RefreshUrl = $"https://sponsorkit.io/api/signup/activate-stripe-account/{userId}",
                    ReturnUrl = $"https://sponsorkit.io/api/signup/completed",
                    Type = "account_onboarding"
                });
            return requestData.CreateRedirectResponse(linkResponse.Url);
        }
    }
}