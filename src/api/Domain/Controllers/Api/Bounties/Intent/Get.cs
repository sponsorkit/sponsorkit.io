using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.Intent
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
        public override async Task<ActionResult<GetResponse>> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = default)
        {
            var userId = User.GetRequiredId();
            
            var matchingPayment = await dataContext.Payments
                .Include(x => x.Bounty)
                .SingleOrDefaultAsync(
                    x => x.StripeId == request.IntentId,
                    cancellationToken);
            if (matchingPayment == null)
                return new GetResponse(false);

            return matchingPayment.Bounty?.CreatorId != userId ? 
                new GetResponse(false) : 
                new GetResponse(true);
        }
    }
}