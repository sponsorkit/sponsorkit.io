using System;
using System.Collections.Generic;

namespace Sponsorkit.Domain.Models
{
    public class User
    {
        public string StripeId { get; set; } = null!;
        
        public DateTime CreatedAtUtc { get; set; }
        
        public List<Identity> Identities { get; set; } = new List<Identity>();
        public List<Repository> Repositories { get; set; } = new List<Repository>();
        
        public List<Bounty> CreatedBounties { get; set; } = new List<Bounty>();
        public List<Bounty> AwardedBounties { get; set; } = new List<Bounty>();

        public List<Sponsorship> CreatedSponsorships { get; set; } = new List<Sponsorship>();
        public List<Sponsorship> AwardedSponsorships { get; set; } = new List<Sponsorship>();
    }
}