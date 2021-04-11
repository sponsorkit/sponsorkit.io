using System;
using System.ComponentModel.DataAnnotations;

namespace Sponsorkit.Domain.Models
{
    public class Bounty
    {
        [Key]
        public Guid Id { get; set; }
        
        public int AmountInHundreds { get; set; }
        public DateTime CreatedAtUtc { get; set; }

        public User Creator { get; set; } = null!;
        public Guid CreatorId { get; set; }
        
        public User? AwardedTo { get; set; }
        public Guid AwardedToId { get; set; }

        public Issue Issue { get; set; } = null!;

        public Payment? Payment { get; set; }
    }
}