using System;

namespace Sponsorkit.Domain.Models.Builders;

public class BountyBuilder : ModelBuilder<Bounty>
{
    private User? creator;
    private Issue? issue;

    private readonly DateTimeOffset createdAt;

    public BountyBuilder()
    {
        createdAt = DateTimeOffset.UtcNow;
    }

    public BountyBuilder WithCreator(User creator)
    {
        this.creator = creator;
        return this;
    }

    public BountyBuilder WithIssue(Issue issue)
    {
        this.issue = issue;
        return this;
    }

    public override Bounty Build()
    {
        if (creator == null)
            throw new InvalidOperationException("No creator set.");

        if (issue == null)
            throw new InvalidOperationException("No issue set.");

        return new Bounty()
        {
            Creator = creator,
            Issue = issue,
            CreatedAt = createdAt
        };
    }
}