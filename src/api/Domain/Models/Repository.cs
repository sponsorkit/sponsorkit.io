using System;
using System.Collections.Generic;

namespace Sponsorkit.Domain.Models
{
    public class Repository
    {
        public string GitHubId { get; set; } = null!;
        
        public DateTime CreatedAtUtc { get; set; }
        
        public User? Owner { get; set; }
        public List<Issue> Issues { get; set; } = new List<Issue>();
    }
}