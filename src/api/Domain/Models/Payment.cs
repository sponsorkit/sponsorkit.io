using System;
using System.ComponentModel.DataAnnotations;

namespace Sponsorkit.Domain.Models
{
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
        public DateTimeOffset? TransferredToConnectedAccountAtUtc { get; set; }
        
        /// <summary>
        /// The date at which the fees for this transfer have been payed out to the platform (Sponsorkit's) bank account.
        /// </summary>
        public DateTimeOffset? FeePayedOutToPlatformBankAccountAtUtc { get; set; }
        
        /// <summary>
        /// The amount of money in hundreds, UTC.
        /// </summary>
        public int AmountInHundreds { get; set; }
        public string StripeId { get; set; } = null!;
        public DateTimeOffset CreatedAtUtc { get; set; }
    }
}