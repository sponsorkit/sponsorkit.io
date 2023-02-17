namespace Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;

public class BountyBuilder : AsyncModelBuilder<Bounty>
{
    protected User? Creator;
    protected Issue? Issue;

    private readonly DateTimeOffset createdAt;

    public BountyBuilder()
    {
        createdAt = DateTimeOffset.UtcNow;
    }

    public BountyBuilder WithCreator(User creator)
    {
        this.Creator = creator;
        return this;
    }

    public BountyBuilder WithIssue(Issue issue)
    {
        this.Issue = issue;
        return this;
    }

    public override Task<Bounty> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (Creator == null)
            throw new InvalidOperationException("No creator set.");

        if (Issue == null)
            throw new InvalidOperationException("No issue set.");

        return Task.FromResult(new Bounty()
        {
            Creator = Creator,
            Issue = Issue,
            CreatedAt = createdAt
        });
    }
}