using System;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Sponsorkit.Domain.Models;

public class Payment
{
    [Key]
    public Guid Id { get; set; }
        
    public Bounty? Bounty { get; set; }
    public Guid? BountyId { get; set; }
        
    public Sponsorship? Sponsorship { get; set; }
    public Guid? SponsorshipId { get; set; }
        
    /// <summary>
    /// The date at which the amount (after fees are deducted) has been sent to the connected account (the receiver of the sponsorship, or the claimer of the bounty).
    /// </summary>
    public DateTimeOffset? TransferredToConnectedAccountAt { get; set; }
        
    /// <summary>
    /// The date at which the fees for this transfer have been payed out to the platform (Sponsorkit's) bank account.
    /// </summary>
    public DateTimeOffset? FeePayedOutToPlatformBankAccountAt { get; set; }
        
    /// <summary>
    /// The amount in hundreds, excluding the fee.
    /// </summary>
    public long AmountInHundreds { get; set; }
        
    /// <summary>
    /// The fee in hundreds.
    /// </summary>
    public long FeeInHundreds { get; set; }
        
    /// <summary>
    /// The ID of the setup intent in Stripe.
    /// </summary>
    public string StripeId { get; set; } = null!;
        
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>
    /// The ID of the webhook event that created this bounty. Bounties are always created from webhook calls from Stripe, despite being initiated by the user. This is because some forms of payment attempts require additional processing time.
    /// </summary>
    public string StripeEventId { get; set; } = null!;
}
    
public class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> builder)
    {
        builder
            .HasIndex(x => x.StripeId)
            .IsUnique();
            
        builder
            .HasIndex(x => x.StripeEventId)
            .IsUnique();
    }
}