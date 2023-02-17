namespace Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;

public class BountyClaimRequestBuilder : AsyncModelBuilder<BountyClaimRequest>
{
    protected Bounty? Bounty;
    protected User? Creator;
    protected PullRequest? PullRequest;
        
    private readonly DateTimeOffset createdAt;
    
    private ClaimVerdict verdict;

    public BountyClaimRequestBuilder()
    {
        createdAt = DateTimeOffset.UtcNow;
    }

    public BountyClaimRequestBuilder WithVerdict(ClaimVerdict verdict)
    {
        this.verdict = verdict;
        return this;
    }

    public BountyClaimRequestBuilder WithBounty(Bounty bounty)
    {
        this.Bounty = bounty;
        return this;
    }

    public BountyClaimRequestBuilder WithCreator(User creator)
    {
        this.Creator = creator;
        return this;
    }

    public BountyClaimRequestBuilder WithPullRequest(PullRequest pullRequest)
    {
        this.PullRequest = pullRequest;
        return this;
    }

    public override Task<BountyClaimRequest> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (Bounty == null)
            throw new InvalidOperationException("The bounty must be set.");
            
        if (Creator == null)
            throw new InvalidOperationException("The creator must be set.");
            
        if (PullRequest == null)
            throw new InvalidOperationException("The pull request must be set.");
            
        return Task.FromResult(new BountyClaimRequest()
        {
            Bounty = Bounty,
            Creator = Creator,
            CreatedAt = createdAt,
            PullRequest = PullRequest,
            Verdict = verdict
        });
    }
}