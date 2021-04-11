using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Sponsorkit.Domain.Models
{
    public class Issue
    {
        [Key]
        public Guid Id { get; set; }
        
        public string GitHubId { get; set; } = null!;

        public Repository Repository { get; set; } = null!;

        public List<Bounty> Bounties { get; set; } = new List<Bounty>();
    }
}