using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Octokit.GraphQL;

namespace Sponsorkit.Domain.Controllers.Api.GitHub.Repositories.RepositoryOwner.RepositoryName.Issues.IssueNumber.PullRequests
{
    public record GetRequest(
        string RepositoryOwner,
        string RepositoryName,
        long IssueNumber,
        string Username);
    
    public class Get : BaseAsyncEndpoint
        .WithRequest<GetRequest>
        .WithoutResponse
    {
        private readonly IConnection octokitClient;

        public Get(
            IConnection octokitClient)
        {
            this.octokitClient = octokitClient;
        }
        
        [HttpGet("/github/repositories/{repositoryOwner}/{repositoryName}/issues/{issueNumber}/pull-requests/from-user")]
        public override Task<ActionResult> HandleAsync(GetRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var query = new Query()
                .Search(
                    query: $"is:pr author:{request.Username} repo:{request.RepositoryOwner}/{request.RepositoryName}");
        }
    }
}