using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using AutoMapper;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Octokit;
using Octokit.GraphQL;
using Octokit.GraphQL.Model;
using Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.GitHub;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.Security.Encryption;
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
        private readonly IMediator mediator;
        private readonly IAesEncryptionHelper aesEncryptionHelper;
        private readonly IMapper mapper;

        private readonly DataContext dataContext;

        public Get(
            IGitHubClientFactory gitHubClientFactory, 
            IMediator mediator,
            IAesEncryptionHelper aesEncryptionHelper,
            IMapper mapper,
            DataContext dataContext)
        {
            this.gitHubClientFactory = gitHubClientFactory;
            this.mediator = mediator;
            this.aesEncryptionHelper = aesEncryptionHelper;
            this.mapper = mapper;
            this.dataContext = dataContext;
        }
        
        [AllowAnonymous]
        [HttpGet("/github/repositories/{repositoryOwner}/{repositoryName}/pull-requests/from-user/{username}")]
        public override async Task<ActionResult<GetResponse>> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var token = await GetGitHubAccessTokenIfPresentAsync(cancellationToken);

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

        private async Task<string?> GetGitHubAccessTokenIfPresentAsync(CancellationToken cancellationToken)
        {
            var userId = User.GetId();
            if (userId != null)
            {
                var user = await dataContext.Users.SingleOrDefaultAsync(
                    x => x.Id == userId,
                    cancellationToken);
                var encryptedToken = user.GitHub?.EncryptedAccessToken;
                if (encryptedToken != null)
                {
                    return await aesEncryptionHelper.DecryptAsync(encryptedToken);
                }
            }

            return null;
        }
    }
}