using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.Claims.ClaimId.Verdict
{
    public record PostRequest();
    
    public class Post : BaseAsyncEndpoint
        .WithRequest<PostRequest>
        .WithoutResponse
    {
        [HttpPost("/bounties/claims/{claimId}/verdict")]
        public override Task<ActionResult> HandleAsync(PostRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            throw new System.NotImplementedException();
        }
    }
}