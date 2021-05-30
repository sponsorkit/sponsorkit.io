using System;
using System.ComponentModel.DataAnnotations;

namespace Sponsorkit.Domain.Models
{
    public class Bounty
    {
        [Key]
        public Guid Id { get; init; }
        
        public int AmountInHundreds { get; init; }
        public DateTime CreatedAtUtc { get; init; }

        public User Creator { get; init; } = null!;
        public Guid CreatorId { get; init; }
        
        public User? AwardedTo { get; init; }
        public Guid AwardedToId { get; init; }

        public Issue Issue { get; init; } = null!;

        public Payment? Payment { get; init; }
    }
}