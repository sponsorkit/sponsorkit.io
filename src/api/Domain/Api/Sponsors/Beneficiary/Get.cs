using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;

namespace Sponsorkit.Domain.Api.Sponsors.Beneficiary
{
    public record Response(
        Guid Id)
    {
        public long? GitHubId { get; set; }
    }

    public record Request(
        [FromRoute] Guid BeneficiaryId);
    
    public class Get : BaseAsyncEndpoint
        .WithRequest<Request>
        .WithResponse<Response>
    {
        private readonly DataContext dataContext;

        public Get(
            DataContext dataContext)
        {
            this.dataContext = dataContext;
        }

        [HttpGet("/api/sponsors/{beneficiaryId}")]
        public override async Task<ActionResult<Response>> HandleAsync(Request request, CancellationToken cancellationToken = new())
        {
            var user = await dataContext.Users.SingleOrDefaultAsync(
                x => x.Id == request.BeneficiaryId, 
                cancellationToken: cancellationToken);

            return new OkObjectResult(new Response(user.Id)
            {
                GitHubId = user.GitHub?.Id
            });
        }
    }
}
