using System.Collections.Generic;

namespace Sponsorkit.Domain.Models
{
    public class Issue
    {
        public string GitHubId { get; set; } = null!;

        public Repository Repository { get; set; } = null!;

        public List<Bounty> Bounties { get; set; } = new List<Bounty>();
    }
}