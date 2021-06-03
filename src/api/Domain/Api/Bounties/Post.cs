using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;

namespace Sponsorkit.Domain.Api.Bounties
{
    public record PostRequest(
        [FromQuery] long GitHubIssueId,
        [FromBody] int AmountInHundreds);
    
    public class Post : BaseAsyncEndpoint
        .WithRequest<PostRequest>
        .WithoutResponse
    {
        [HttpPost("/api/bounties")]
        public override async Task<ActionResult> HandleAsync(PostRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            throw new System.NotImplementedException();
        }
    }
}