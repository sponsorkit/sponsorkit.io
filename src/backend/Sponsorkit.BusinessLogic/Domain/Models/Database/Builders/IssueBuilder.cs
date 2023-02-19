namespace Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;

public class IssueBuilder : AsyncModelBuilder<Issue>
{
    protected Repository? Repository;
    
    private Bounty[] bounties;
    private IssueGitHubInformation? gitHub;

    public IssueBuilder()
    {
        bounties = Array.Empty<Bounty>();
    }

    public IssueBuilder WithBounties(params Bounty[] bounties)
    {
        this.bounties = bounties;
        return this;
    }

    public IssueBuilder WithRepository(Repository repository)
    {
        Repository = repository;
        return this;
    }

    public IssueBuilder WithGitHubInformation(
        long id,
        int number,
        string titleSnapshot)
    {
        gitHub = new IssueGitHubInformation()
        {
            Id = id,
            Number = number,
            TitleSnapshot = titleSnapshot
        };
        return this;
    }

    public override Task<Issue> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (gitHub == null)
            throw new InvalidOperationException("GitHub information was not set.");

        if (Repository == null)
            throw new InvalidOperationException("Repository was not set.");
            
        return Task.FromResult(new Issue()
        {
            Bounties = bounties.ToList(),
            Repository = Repository,
            GitHub = gitHub
        });
    }
}