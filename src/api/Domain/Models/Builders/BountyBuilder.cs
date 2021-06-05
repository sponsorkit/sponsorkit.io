using System;

namespace Sponsorkit.Domain.Models.Builders
{
    public class BountyBuilder : ModelBuilder<Bounty>
    {
        private User? creator;
        private Issue? issue;

        private int? amountInHundreds;

        private DateTime createdAtUtc;

        public BountyBuilder()
        {
            createdAtUtc = DateTime.UtcNow;
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

        public BountyBuilder WithAmountInHundreds(int amountInHundreds)
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

            return new Bounty()
            {
                Creator = creator,
                Issue = issue,
                AmountInHundreds = amountInHundreds.Value,
                CreatedAtUtc = createdAtUtc
            };
        }
    }
}