using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Sponsorkit.Domain.Models
{
    public class Issue
    {
        [Key]
        public Guid Id { get; init; }
        
        public string GitHubId { get; init; } = null!;

        public Repository Repository { get; init; } = null!;

        public List<Bounty> Bounties { get; init; } = new();
    }
}