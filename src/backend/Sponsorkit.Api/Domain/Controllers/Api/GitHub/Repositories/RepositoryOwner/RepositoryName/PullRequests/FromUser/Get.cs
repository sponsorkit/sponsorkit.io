﻿using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Octokit.GraphQL;
using Octokit.GraphQL.Model;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.BusinessLogic.Infrastructure.AspNet;
using Sponsorkit.BusinessLogic.Infrastructure.GitHub;
using PullRequest = Octokit.GraphQL.Model.PullRequest;

namespace Sponsorkit.Api.Domain.Controllers.Api.GitHub.Repositories.RepositoryOwner.RepositoryName.PullRequests.FromUser;

public record GetRequest(
    [FromRoute] string RepositoryOwner,
    [FromRoute] string RepositoryName);

public record PullRequestResponse(
    int Number,
    string Title,
    DateTimeOffset? MergedAt,
    PullRequestState State);

public record GetResponse(
    IEnumerable<PullRequestResponse> PullRequests);
    
public class Get : EndpointBaseAsync
    .WithRequest<GetRequest>
    .WithActionResult<GetResponse>
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
        
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [HttpGet("github/repositories/{repositoryOwner}/{repositoryName}/pull-requests/from-user")]
    public override async Task<ActionResult<GetResponse>> HandleAsync([FromRoute] GetRequest request, CancellationToken cancellationToken = new())
    {
        var userId = User.GetRequiredId();

        var user = await dataContext.Users.SingleOrDefaultAsync(
            x => x.Id == userId,
            cancellationToken);
        if (user?.GitHub == null)
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