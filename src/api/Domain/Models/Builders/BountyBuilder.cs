using System;

namespace Sponsorkit.Domain.Models.Builders
{
    public class BountyBuilder : ModelBuilder<Bounty>
    {
        private User? creator;
        private Issue? issue;

        private long? amountInHundreds;

        private DateTimeOffset createdAtUtc;

        public string? stripeEventId;

        public BountyBuilder()
        {
            createdAtUtc = DateTime.UtcNow;
        }

        public BountyBuilder WithStripeEventId(string eventId)
        {
            this.stripeEventId = eventId;
            return this;
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

        public BountyBuilder WithAmountInHundreds(long amountInHundreds)
        {
            this.amountInHundreds = amountInHundreds;
            return this;
        }

        public override Bounty Build()
        {
            if (creator == null)
                throw new InvalidOperationException("No creator set.");

            if (issue == null)
                throw new InvalidOperationException("No issue set.");

            if (amountInHundreds == null)
                throw new InvalidOperationException("Amount not specified.");

            if (stripeEventId == null)
                throw new InvalidOperationException("Stripe event ID not set.");

            return new Bounty()
            {
                Creator = creator,
                Issue = issue,
                AmountInHundreds = amountInHundreds.Value,
                CreatedAtUtc = createdAtUtc,
                StripeEventId = stripeEventId
            };
        }
    }
}