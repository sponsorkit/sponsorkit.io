using System;
using System.ComponentModel.DataAnnotations;

namespace Sponsorkit.Domain.Models
{
    public class Payment
    {
        [Key]
        public Guid Id { get; init; }
        
        public Bounty? Bounty { get; init; }
        public Guid? BountyId { get; init; }
        
        public Sponsorship? Sponsorship { get; init; }
        public Guid? SponsorshipId { get; init; }
        
        public int AmountInHundreds { get; init; }
        public string StripeId { get; init; } = null!;
        public DateTime CreatedAtUtc { get; init; }
    }
}