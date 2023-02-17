namespace Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;

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

        var pullRequest = new PullRequest()
        {
            GitHub = GitHub,
            Repository = Repository
        };
        Repository.PullRequests.Add(pullRequest);
        
        return Task.FromResult(pullRequest);
    }
}