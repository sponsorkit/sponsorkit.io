using System;

namespace Sponsorkit.Domain.Models.Builders
{
    public class PaymentBuilder : ModelBuilder<Payment>
    {
        private Guid id;
        private Bounty? bounty;
        private Sponsorship? sponsorship;
        
        private DateTimeOffset? transferredToConnectedAccountAtUtc;
        private DateTimeOffset? feePayedOutToPlatformBankAccountAtUtc;

        private int? amountInHundreds;
        private string? stripeId;
        private DateTimeOffset createdAtUtc;
        private string? stripeEventId;

        public PaymentBuilder()
        {
            createdAtUtc = DateTime.UtcNow;
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

        public PaymentBuilder WithTransferredToConnectedAccountAtcUtc(DateTimeOffset date)
        {
            this.transferredToConnectedAccountAtUtc = date;
            return this;
        }

        public PaymentBuilder WithFeePayedOutToPlatformBankAccountAtUtc(DateTimeOffset date)
        {
            this.feePayedOutToPlatformBankAccountAtUtc = date;
            return this;
        }

        public PaymentBuilder WithAmountInHundreds(int amountInHundreds)
        {
            this.amountInHundreds = amountInHundreds;
            return this;
        }

        public PaymentBuilder WithStripeId(string stripeId)
        {
            this.stripeId = stripeId;
            return this;
        }

        public PaymentBuilder WithCreatedAtUtc(DateTimeOffset createdAtUtc)
        {
            this.createdAtUtc = createdAtUtc;
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

            return new Payment()
            {
                Bounty = bounty,
                Id = id,
                Sponsorship = sponsorship,
                StripeId = stripeId,
                AmountInHundreds = amountInHundreds.Value,
                CreatedAtUtc = createdAtUtc,
                TransferredToConnectedAccountAtUtc = transferredToConnectedAccountAtUtc,
                FeePayedOutToPlatformBankAccountAtUtc = feePayedOutToPlatformBankAccountAtUtc,
                StripeEventId = stripeEventId
            };
        }
    }
}