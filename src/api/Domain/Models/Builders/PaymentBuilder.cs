using System;

namespace Sponsorkit.Domain.Models.Builders
{
    public class PaymentBuilder : ModelBuilder<Payment>
    {
        private Guid id;
        private Bounty? bounty;
        private Sponsorship? sponsorship;
        
        private DateTimeOffset? transferredToConnectedAccountAt;
        private DateTimeOffset? feePayedOutToPlatformBankAccountAt;

        private long? amountInHundreds;
        private string? stripeId;
        private string? stripeEventId;
        
        private readonly DateTimeOffset createdAt;

        public PaymentBuilder()
        {
            createdAt = DateTimeOffset.UtcNow;
        }

        public PaymentBuilder WithStripeEventId(string eventId)
        {
            this.stripeEventId = eventId;
            return this;
        }

        public PaymentBuilder WithId(Guid id)
        {
            this.id = id;
            return this;
        }

        public PaymentBuilder WithBounty(Bounty bounty)
        {
            this.bounty = bounty;
            return this;
        }

        public PaymentBuilder WithSponsorship(Sponsorship sponsorship)
        {
            this.sponsorship = sponsorship;
            return this;
        }

        public PaymentBuilder WithTransferredToConnectedAccountAt(DateTimeOffset date)
        {
            this.transferredToConnectedAccountAt = date;
            return this;
        }

        public PaymentBuilder WithFeePayedOutToPlatformBankAccountAt(DateTimeOffset date)
        {
            this.feePayedOutToPlatformBankAccountAt = date;
            return this;
        }

        public PaymentBuilder WithAmountInHundreds(long amountInHundreds)
        {
            this.amountInHundreds = amountInHundreds;
            return this;
        }

        public PaymentBuilder WithStripeId(string stripeId)
        {
            this.stripeId = stripeId;
            return this;
        }
        
        public override Payment Build()
        {
            if (amountInHundreds == null)
                throw new InvalidOperationException("An amount must be specified.");

            if (stripeId == null)
                throw new InvalidOperationException("Stripe ID must be set.");

            if (stripeEventId == null)
                throw new InvalidOperationException("Stripe event ID must be set.");

            if (amountInHundreds <= 0)
                throw new InvalidOperationException("Amount must be positive.");

                return new Payment()
            {
                Bounty = bounty,
                Id = id,
                Sponsorship = sponsorship,
                StripeId = stripeId,
                AmountInHundreds = amountInHundreds.Value,
                CreatedAt = createdAt,
                TransferredToConnectedAccountAt = transferredToConnectedAccountAt,
                FeePayedOutToPlatformBankAccountAt = feePayedOutToPlatformBankAccountAt,
                StripeEventId = stripeEventId
            };
        }
    }
}