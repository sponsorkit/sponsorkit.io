using System;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Domain.Models.Stripe;

namespace Sponsorkit.Domain.Models.Database.Builders;

public class BountyClaimRequestBuilder : AsyncModelBuilder<BountyClaimRequest>
{
    private Bounty? bounty;
    private User? creator;
    private PullRequest? pullRequest;
        
    private readonly DateTimeOffset createdAt;

    public BountyClaimRequestBuilder()
    {
        createdAt = DateTimeOffset.UtcNow;
    }

    public BountyClaimRequestBuilder WithBounty(Bounty bounty)
    {
        this.bounty = bounty;
        return this;
    }

    public BountyClaimRequestBuilder WithCreator(User creator)
    {
        this.creator = creator;
        return this;
    }

    public BountyClaimRequestBuilder WithPullRequest(PullRequest pullRequest)
    {
        this.pullRequest = pullRequest;
        return this;
    }

    public override Task<BountyClaimRequest> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (bounty == null)
            throw new InvalidOperationException("The bounty must be set.");
            
        if (creator == null)
            throw new InvalidOperationException("The creator must be set.");
            
        if (pullRequest == null)
            throw new InvalidOperationException("The pull request must be set.");
            
        return Task.FromResult(new BountyClaimRequest()
        {
            Bounty = bounty,
            Creator = creator,
            CreatedAt = createdAt,
            PullRequest = pullRequest
        });
    }
}