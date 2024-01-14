namespace Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;

public class RepositoryBuilder : AsyncModelBuilder<Repository>
{
    private Guid id;

    private User? owner;
    private List<Issue>? issues;
    private List<Sponsorship>? sponsorships;
    private RepositoryGitHubInformation? gitHub;

    public RepositoryBuilder WithId(Guid id)
    {
        this.id = id;
        return this;
    }

    public RepositoryBuilder WithGitHubInformation(long gitHubId,
        string ownerName,
        string name)
    {
        gitHub = new RepositoryGitHubInformation()
        {
            Id = gitHubId,
            Name = name,
            OwnerName = ownerName
        };
        return this;
    }

    public RepositoryBuilder WithOwner(User owner)
    {
        this.owner = owner;
        return this;
    }

    public RepositoryBuilder WithIssues(params Issue[] issues)
    {
        this.issues = issues.ToList();
        return this;
    }

    public RepositoryBuilder WithSponsorships(params Sponsorship[] sponsorships)
    {
        this.sponsorships = sponsorships.ToList();
        return this;
    }

    public override Task<Repository> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (gitHub == null)
            throw new InvalidOperationException("No GitHub information was specified.");
            
        return Task.FromResult(new Repository()
        {
            Id = id,
            Owner = owner,
            Issues = issues ?? [],
            Sponsorships = sponsorships ?? [],
            GitHub = gitHub
        });
    }
}