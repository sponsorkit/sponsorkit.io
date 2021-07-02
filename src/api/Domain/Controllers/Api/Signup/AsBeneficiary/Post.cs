using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.Encryption;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Signup.AsBeneficiary
{
    public class Post : BaseAsyncEndpoint
        .WithoutRequest
        .WithoutResponse
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
        
        [HttpPost("/api/signup/as-beneficiary")]
        public override async Task<ActionResult> HandleAsync(CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetRequiredId();
            
            await dataContext.ExecuteInTransactionAsync(
                async () =>
                {
                    var user = await dataContext.Users.SingleAsync(
                        x => x.Id == userId,
                        cancellationToken);
                    
                    var account = await CreateStripeAccountForUserAsync(user, cancellationToken);
                    user.StripeConnectId = account.Id;
                    await dataContext.SaveChangesAsync(cancellationToken);

                    await SendMailAsync(
                        account.Email,
                        "Fill in your information with Stripe",
                        $"Yada yada: https://sponsorkit.io/api/signup/activate-stripe-account/{user.Id}");
                });

            return new OkResult();
        }

        private async Task SendMailAsync(
            string emailAddress, 
            string title, 
            string content)
        {
            throw new NotImplementedException();
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