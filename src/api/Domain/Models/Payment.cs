using System;

namespace Sponsorkit.Domain.Models
{
    public class Payment
    {
        public Bounty? Bounty { get; set; }
        public int AmountInHundreds { get; set; }
        public string StripeId { get; set; } = null!;
        public DateTime CreatedAtUtc { get; set; }
    }
}