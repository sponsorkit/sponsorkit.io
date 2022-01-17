using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Octokit;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.GitHub;

namespace Sponsorkit.Domain.Controllers.Octokit.Repos.RepositoryOwner.RepositoryName.Issues.IssueNumber
{
    public record GetRequest(
        [FromRoute] string RepositoryOwner,
        [FromRoute] string RepositoryName,
        [FromRoute] int IssueNumber);
    
    public class Get : BaseAsyncEndpoint
        .WithRequest<GetRequest>
        .WithResponse<Issue>
    {
        private readonly IGitHubClientFactory gitHubClientFactory;
        private readonly DataContext dataContext;

        public Get(
            IGitHubClientFactory gitHubClientFactory,
            DataContext dataContext)
        {
            this.gitHubClientFactory = gitHubClientFactory;
            this.dataContext = dataContext;
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
                request.IssueNumber);
            if (issue == null)
                return NotFound("Repository not found.");

            await UpdateIssueInDatabaseAsync(request, issue, cancellationToken);

            return issue;
        }

        private async Task UpdateIssueInDatabaseAsync(
            GetRequest request, 
            Issue issue, 
            CancellationToken cancellationToken)
        {
            var databaseIssue = await dataContext.Issues
                .AsQueryable()
                .FirstOrDefaultAsync(
                    x =>
                        x.GitHub.Number == request.IssueNumber &&
                        x.Repository.GitHub.OwnerName == request.RepositoryOwner &&
                        x.Repository.GitHub.Name == request.RepositoryName,
                    cancellationToken);
            if (databaseIssue == null)
                return;
            
            databaseIssue.GitHub.ClosedAt = issue.ClosedAt;
            databaseIssue.GitHub.TitleSnapshot = issue.Title;
            
            await dataContext.SaveChangesAsync(cancellationToken);
        }
    }
}