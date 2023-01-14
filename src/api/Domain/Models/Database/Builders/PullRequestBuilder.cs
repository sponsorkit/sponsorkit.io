﻿using System;
using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Domain.Models.Database.Builders;

public class PullRequestBuilder : AsyncModelBuilder<PullRequest>
{
    protected PullRequestGitHubInformation? GitHub;
    protected Repository? Repository;

    public PullRequestBuilder WithGitHubInformation(
        long id,
        int number)
    {
        this.GitHub = new PullRequestGitHubInformation()
        {
            Id = id,
            Number = number
        };
        return this;
    }

    public PullRequestBuilder WithRepository(Repository repository)
    {
        this.Repository = repository;
        return this;
    }

    public override Task<PullRequest> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (this.GitHub == null)
            throw new InvalidOperationException("GitHub information not set.");

        if (this.Repository == null)
            throw new InvalidOperationException("Repository not set.");

        return Task.FromResult(new PullRequest()
        {
            GitHub = GitHub,
            Repository = Repository
        });
    }
}