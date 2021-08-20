using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.Security.Encryption;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Account.StripeConnect.Setup
{
    public record Response(
        string ActivationUrl);
    
    public class Post : BaseAsyncEndpoint
        .WithoutRequest
        .WithResponse<Response>
    {
        private readonly DataContext dataContext;
        private readonly AccountService accountService;
        
        private readonly IAesEncryptionHelper aesEncryptionHelper;

        public Post(
            DataContext dataContext,
            AccountService accountService,
            IAesEncryptionHelper aesEncryptionHelper)
        {
            this.dataContext = dataContext;
            this.accountService = accountService;
            this.aesEncryptionHelper = aesEncryptionHelper;
        }
        
        [HttpPost("/account/stripe-connect/setup")]
        public override async Task<ActionResult<Response>> HandleAsync(CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetRequiredId();
            
            return await dataContext.ExecuteInTransactionAsync(
                async () =>
                {
                    var user = await dataContext.Users.SingleAsync(
                        x => x.Id == userId,
                        cancellationToken);
                    
                    var account = await CreateStripeAccountForUserAsync(user, cancellationToken);
                    user.StripeConnectId = account.Id;
                    await dataContext.SaveChangesAsync(cancellationToken);

                    return new Response(
                        $"https://api.sponsorkit.io/account/stripe-connect/activate/{user.Id}");
                });
        }

        private async Task<Stripe.Account> CreateStripeAccountForUserAsync(
            User user, 
            CancellationToken cancellationToken)
        {
            var email = await aesEncryptionHelper.DecryptAsync(user.EncryptedEmail);
            return await accountService.CreateAsync(
                new AccountCreateOptions()
                {
                    Email = email,
                    Type = "standard"
                },
                cancellationToken: cancellationToken);
        }
    }
}