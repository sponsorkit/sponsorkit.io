using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Octokit;
using Sponsorkit.Infrastructure.GitHub;

namespace Sponsorkit.Domain.Controllers.Octokit.Repos.RepositoryOwner.RepositoryName.Issues.IssueNumber
{
    public record GetRequest(
        [FromRoute] string RepositoryOwner,
        [FromRoute] string RepositoryName,
        [FromRoute] long IssueNumber);
    
    public class Get : BaseAsyncEndpoint
        .WithRequest<GetRequest>
        .WithResponse<Issue>
    {
        private readonly IGitHubClientFactory gitHubClientFactory;

        public Get(
            IGitHubClientFactory gitHubClientFactory)
        {
            this.gitHubClientFactory = gitHubClientFactory;
        }
        
        [AllowAnonymous]
        [HttpGet("/octokit/repos/{repositoryOwner}/{repositoryName}/issues/{issueNumber}")]
        public override async Task<ActionResult<Issue>> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var token = await gitHubClientFactory.GetAccessTokenFromUserIfPresentAsync(
                User,
                cancellationToken);

            var client = gitHubClientFactory.CreateClientFromOAuthAuthenticationToken(token);
            var issue = await client.Issue.Get(
                request.RepositoryOwner,
                request.RepositoryName,
                (int)request.IssueNumber);
            if (issue == null)
                return NotFound("Repository not found.");
            
            return issue;
        }
    }
}