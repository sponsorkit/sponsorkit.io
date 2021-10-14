using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.PaymentIntent
{
    public record GetRequest(
        string IntentId);

    public record GetResponse(
        bool IsProcessed);
    
    public class Get : BaseAsyncEndpoint
        .WithRequest<GetRequest>
        .WithResponse<GetResponse>
    {
        private readonly DataContext dataContext;

        public Get(
            DataContext dataContext)
        {
            this.dataContext = dataContext;
        }
        
        [HttpGet("/bounties/payment-intent/{intentId}")]
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
            return new GetResponse(matchingPayment != null);
        }
    }
}