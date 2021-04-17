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

        public string Name { get; set; } = null!;

        public string StripeId { get; set; } = null!;

        public string? GitHubId { get; set; }

        public DateTime CreatedAtUtc { get; set; }
        
        public List<Identity> Identities { get; set; } = new();
        public List<Repository> Repositories { get; set; } = new();
        
        public List<Bounty> CreatedBounties { get; set; } = new();
        public List<Bounty> AwardedBounties { get; set; } = new();

        public List<Sponsorship> CreatedSponsorships { get; set; } = new();
        public List<Sponsorship> AwardedSponsorships { get; set; } = new();
    }
}