using System;
using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Domain.Models.Database.Builders;

public class PaymentBuilder : AsyncModelBuilder<Payment>
{
    private Bounty? bounty;
    private Sponsorship? sponsorship;

    private long? amountInHundreds;
    private long? feeInHundreds;
        
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

    public PaymentBuilder WithAmount(
        long amountInHundreds,
        long feeInHundreds)
    {
        this.amountInHundreds = amountInHundreds;
        this.feeInHundreds = feeInHundreds;
        return this;
    }

    public PaymentBuilder WithStripeId(string stripeId)
    {
        this.stripeId = stripeId;
        return this;
    }

    public override Task<Payment> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (amountInHundreds == null)
            throw new InvalidOperationException("An amount must be specified.");
            
        if (feeInHundreds == null)
            throw new InvalidOperationException("A fee must be specified.");

        if (stripeId == null)
            throw new InvalidOperationException("Stripe ID must be set.");

        if (stripeEventId == null)
            throw new InvalidOperationException("Stripe event ID must be set.");

        if (amountInHundreds <= 0)
            throw new InvalidOperationException("Amount must be positive.");

        if (feeInHundreds <= 0)
            throw new InvalidOperationException("Fee must be positive.");

        return Task.FromResult(new Payment()
        {
            Bounty = bounty,
            Sponsorship = sponsorship,
            StripeId = stripeId,
            AmountInHundreds = amountInHundreds.Value,
            FeeInHundreds = feeInHundreds.Value,
            CreatedAt = createdAt,
            StripeEventId = stripeEventId
        });
    }
}