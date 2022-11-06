using System;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Domain.Models.Stripe;

namespace Sponsorkit.Domain.Models.Database.Builders;

public class BountyBuilder : AsyncModelBuilder<Bounty>
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

    public override Task<Bounty> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (creator == null)
            throw new InvalidOperationException("No creator set.");

        if (issue == null)
            throw new InvalidOperationException("No issue set.");

        return Task.FromResult(new Bounty()
        {
            Creator = creator,
            Issue = issue,
            CreatedAt = createdAt
        });
    }
}