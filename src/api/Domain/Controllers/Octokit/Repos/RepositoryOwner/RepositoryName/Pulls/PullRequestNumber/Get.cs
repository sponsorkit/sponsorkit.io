using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Octokit;
using Sponsorkit.Infrastructure.GitHub;

namespace Sponsorkit.Domain.Controllers.Octokit.Repos.RepositoryOwner.RepositoryName.Pulls.PullRequestNumber
{
    public record GetRequest(
        [FromRoute] string RepositoryOwner,
        [FromRoute] string RepositoryName,
        [FromRoute] long PullRequestNumber);
    
    public class Get : BaseAsyncEndpoint
        .WithRequest<GetRequest>
        .WithResponse<PullRequest>
    {
        private readonly IGitHubClientFactory gitHubClientFactory;

        public Get(
            IGitHubClientFactory gitHubClientFactory)
        {
            this.gitHubClientFactory = gitHubClientFactory;
        }
        
        [AllowAnonymous]
        [HttpGet("/octokit/repos/{repositoryOwner}/{repositoryName}/pulls/{pullRequestNumber}")]
        public override async Task<ActionResult<PullRequest>> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var token = await gitHubClientFactory.GetAccessTokenFromUserIfPresentAsync(
                User,
                cancellationToken);

            var client = gitHubClientFactory.CreateClientFromOAuthAuthenticationToken(token);
            var pullRequest = await client.PullRequest.Get(
                request.RepositoryOwner,
                request.RepositoryName,
                (int)request.PullRequestNumber);
            if (pullRequest == null)
                return NotFound("Repository not found.");
            
            return pullRequest;
        }
    }
}