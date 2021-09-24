using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Octokit.GraphQL;
using Octokit.GraphQL.Model;
using Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.GitHub;
using PullRequest = Octokit.GraphQL.Model.PullRequest;

namespace Sponsorkit.Domain.Controllers.Api.GitHub.Repositories.RepositoryOwner.RepositoryName.PullRequests.FromUser
{
    public record GetRequest(
        [FromRoute] string RepositoryOwner,
        [FromRoute] string RepositoryName,
        [FromRoute] string Username);

    public record PullRequestResponse(
        long Number,
        string Title,
        DateTimeOffset? MergedAt,
        PullRequestState State);

    public record GetResponse(
        IEnumerable<PullRequestResponse> PullRequests);
    
    public class Get : BaseAsyncEndpoint
        .WithRequest<GetRequest>
        .WithResponse<GetResponse>
    {
        private readonly IGitHubClientFactory gitHubClientFactory;

        public Get(
            IGitHubClientFactory gitHubClientFactory)
        {
            this.gitHubClientFactory = gitHubClientFactory;
        }
        
        [AllowAnonymous]
        [HttpGet("/github/repositories/{repositoryOwner}/{repositoryName}/pull-requests/from-user/{username}")]
        public override async Task<ActionResult<GetResponse>> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var token = await gitHubClientFactory.GetAccessTokenFromUserIfPresentAsync(
                User,
                cancellationToken);

            var client = gitHubClientFactory.CreateGraphQlClientFromOAuthAuthenticationToken(token);
            
            var pullRequests = await client.Run(
                new Query()
                    .Search(
                        $"is:pr author:{request.Username} repo:{request.RepositoryOwner}/{request.RepositoryName}",
                        SearchType.Issue,
                        last: 10)
                    .Select(x => x.Nodes)
                    .OfType<PullRequest>()
                    .Select(x => new PullRequestResponse(
                        x.Number,
                        x.Title,
                        x.MergedAt,
                        x.State)),
                cancellationToken);
            return new GetResponse(pullRequests);
        }
    }
}