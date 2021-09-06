using System;

namespace Sponsorkit.Domain.Models.Builders
{
    public class BountyClaimRequestBuilder : ModelBuilder<BountyClaimRequest>
    {
        private Bounty? bounty;
        private User? creator;
        private DateTimeOffset createdAtUtc;

        public BountyClaimRequestBuilder()
        {
            createdAtUtc = DateTimeOffset.UtcNow;
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

        public override BountyClaimRequest Build()
        {
            if (bounty == null)
                throw new InvalidOperationException("The bounty must be set.");
            
            if (creator == null)
                throw new InvalidOperationException("The creator must be set.");
            
            return new BountyClaimRequest()
            {
                Bounty = bounty,
                Creator = creator,
                CreatedAtUtc = createdAtUtc
            };
        }
    }
}