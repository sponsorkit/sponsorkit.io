using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Sponsorkit.Domain.Models
{
    public class Issue
    {
        [Key]
        public Guid Id { get; set; }
        
        public long GitHubId { get; set; }

        public Repository Repository { get; set; } = null!;

        public List<Bounty> Bounties { get; set; } = new();
    }
}