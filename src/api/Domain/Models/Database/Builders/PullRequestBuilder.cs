using System;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Domain.Models.Stripe;

namespace Sponsorkit.Domain.Models.Database.Builders;

public class PullRequestBuilder : AsyncModelBuilder<PullRequest>
{
    private PullRequestGitHubInformation? gitHub;
    private Repository? repository;

    public PullRequestBuilder WithGitHubInformation(
        long id,
        int number)
    {
        this.gitHub = new PullRequestGitHubInformation()
        {
            Id = id,
            Number = number
        };
        return this;
    }

    public PullRequestBuilder WithRepository(Repository repository)
    {
        this.repository = repository;
        return this;
    }

    public override Task<PullRequest> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (this.gitHub == null)
            throw new InvalidOperationException("GitHub information not set.");

        if (this.repository == null)
            throw new InvalidOperationException("Repository not set.");

        return Task.FromResult(new PullRequest()
        {
            GitHub = gitHub,
            Repository = repository
        });
    }
}