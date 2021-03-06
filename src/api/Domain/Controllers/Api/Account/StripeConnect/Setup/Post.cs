using System.Data;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.Security.Encryption;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Account.StripeConnect.Setup;

public record Response(
    string ActivationUrl);
    
public class Post : EndpointBaseAsync
    .WithoutRequest
    .WithActionResult<Response>
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
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override async Task<ActionResult<Response>> HandleAsync(CancellationToken cancellationToken = new CancellationToken())
    {
        var userId = User.GetRequiredId();
            
        return await dataContext.ExecuteInTransactionAsync(
            async () =>
            {
                var user = await dataContext.Users.SingleAsync(
                    x => x.Id == userId,
                    cancellationToken);

                if (user.StripeConnectId == null)
                {
                    var account = await CreateStripeAccountForUserAsync(user);
                    user.StripeConnectId = account.Id;
                    await dataContext.SaveChangesAsync(default);
                }

                return new Response(
                    LinkHelper.GetWebUrl($"/landing/stripe-connect/activate"));
            },
            IsolationLevel.Serializable);
    }

    private async Task<Stripe.Account> CreateStripeAccountForUserAsync(User user)
    {
        var email = await aesEncryptionHelper.DecryptAsync(user.EncryptedEmail);
        return await accountService.CreateAsync(
            new AccountCreateOptions()
            {
                Email = email,
                Type = "express"
            },
            new RequestOptions()
            {
                IdempotencyKey = $"stripe-account-{user.Id.ToString()}"
            },
            cancellationToken: default);
    }
}