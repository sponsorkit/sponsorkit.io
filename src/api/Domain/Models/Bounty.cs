using System;

namespace Sponsorkit.Domain.Models
{
    public class Bounty
    {
        public int AmountInHundreds { get; set; }
        public DateTime CreatedAtUtc { get; set; }

        public User Creator { get; set; } = null!;
        public User? AwardedTo { get; set; }

        public Issue Issue { get; set; } = null!;

        public Payment? Payment { get; set; }
    }
}