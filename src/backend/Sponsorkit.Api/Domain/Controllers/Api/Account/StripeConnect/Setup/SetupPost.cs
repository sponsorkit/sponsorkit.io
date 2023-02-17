using System;
using System.Data;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.BusinessLogic.Domain.Helpers;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe;
using Sponsorkit.BusinessLogic.Infrastructure.AspNet;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Encryption;

namespace Sponsorkit.Api.Domain.Controllers.Api.Account.StripeConnect.Setup;

public record Request(
    Guid BroadcastId);

public record Response(
    string ActivationUrl);
    
public class SetupPost : EndpointBaseAsync
    .WithRequest<Request>
    .WithActionResult<Response>
{
    private readonly DataContext dataContext;
    private readonly StripeAccountBuilder stripeAccountBuilder;
    private readonly IEncryptionHelper encryptionHelper;

    public SetupPost(
        DataContext dataContext,
        StripeAccountBuilder stripeAccountBuilder,
        IEncryptionHelper encryptionHelper)
    {
        this.dataContext = dataContext;
        this.stripeAccountBuilder = stripeAccountBuilder;
        this.encryptionHelper = encryptionHelper;
    }
        
    [HttpPost("account/stripe-connect/setup")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override async Task<ActionResult<Response>> HandleAsync(
        [FromBody] Request request,
        CancellationToken cancellationToken = new CancellationToken())
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
                    var userEmail = await encryptionHelper.DecryptAsync(user.EncryptedEmail);
                    
                    var account = await stripeAccountBuilder
                        .WithCustomerId(user.StripeCustomerId)
                        .WithEmail(userEmail)
                        .BuildAsync(CancellationToken.None);
                    user.StripeConnectId = account.Id;
                    
                    await dataContext.SaveChangesAsync(default);
                }

                return new Response(
                    LinkHelper.GetStripeConnectActivateUrl(request.BroadcastId));
            },
            IsolationLevel.Serializable);
    }
}