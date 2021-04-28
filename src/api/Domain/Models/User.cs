using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

// ReSharper disable CollectionNeverUpdated.Global

namespace Sponsorkit.Domain.Models
{
    public class User
    {
        [Key]
        public Guid Id { get; set; }
        
        public string EncryptedEmail { get; set; } = null!;

        public string StripeCustomerId { get; set; } = null!;

        public string? StripeConnectId { get; set; }

        public string? GitHubId { get; set; }

        public DateTime CreatedAtUtc { get; set; }
        
        public List<Repository> Repositories { get; set; } = new();
        
        public List<Bounty> CreatedBounties { get; set; } = new();
        public List<Bounty> AwardedBounties { get; set; } = new();

        public List<Sponsorship> CreatedSponsorships { get; set; } = new();
        public List<Sponsorship> AwardedSponsorships { get; set; } = new();
    }
}