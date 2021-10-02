using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Octokit.GraphQL;
using Octokit.GraphQL.Model;
using Sponsorkit.Domain.Controllers.Api.Account.Signup.FromGitHub.GitHub;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using PullRequest = Octokit.GraphQL.Model.PullRequest;

namespace Sponsorkit.Domain.Controllers.Api.GitHub.Repositories.RepositoryOwner.RepositoryName.PullRequests.FromUser
{
    public record GetRequest(
        [FromRoute] string RepositoryOwner,
        [FromRoute] string RepositoryName);

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
        private readonly DataContext dataContext;

        public Get(
            IGitHubClientFactory gitHubClientFactory,
            DataContext dataContext)
        {
            this.gitHubClientFactory = gitHubClientFactory;
            this.dataContext = dataContext;
        }
        
        [HttpGet("/github/repositories/{repositoryOwner}/{repositoryName}/pull-requests/from-user")]
        public override async Task<ActionResult<GetResponse>> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetRequiredId();

            var user = await dataContext.Users.SingleOrDefaultAsync(
                x => x.Id == userId,
                cancellationToken);
            if (user.GitHub == null)
                throw new InvalidOperationException("The user is not connected to GitHub.");
            
            var token = await gitHubClientFactory.GetAccessTokenFromUserIfPresentAsync(user);
            var client = gitHubClientFactory.CreateGraphQlClientFromOAuthAuthenticationToken(token);
            
            var pullRequests = await client.Run(
                new Query()
                    .Search(
                        $"is:pr author:{user.GitHub.Username} repo:{request.RepositoryOwner}/{request.RepositoryName}",
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
            return new GetResponse(pullRequests ?? Array.Empty<PullRequestResponse>());
        }
    }
}