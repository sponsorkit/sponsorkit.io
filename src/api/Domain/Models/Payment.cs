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
        
        public int AmountInHundreds { get; set; }
        public string StripeId { get; set; } = null!;
        public DateTime CreatedAtUtc { get; set; }
    }
}