using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

// ReSharper disable CollectionNeverUpdated.Global

namespace Sponsorkit.Domain.Models
{
    public class User
    {
        [Key]
        public Guid Id { get; init; }
        
        public byte[] EncryptedEmail { get; init; } = null!;

        public string StripeCustomerId { get; init; } = null!;

        public string? StripeConnectId { get; init; }

        public long? GitHubId { get; init; }
        
        public byte[]? EncryptedGitHubAccessToken { get; init; }

        public DateTime CreatedAtUtc { get; init; }
        
        public List<Repository> Repositories { get; init; } = new();
        
        public List<Bounty> CreatedBounties { get; init; } = new();
        public List<Bounty> AwardedBounties { get; init; } = new();

        public List<Sponsorship> CreatedSponsorships { get; init; } = new();
        public List<Sponsorship> AwardedSponsorships { get; init; } = new();
    }
}