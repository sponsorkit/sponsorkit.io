using Sponsorkit.Domain.Models;

namespace Sponsorkit.Domain.Queries.GetSponsorshipSummaries
{
    public class GetSponsorshipSummaryResponse
    {
        public User Beneficiary { get; set; }
        public Sponsorship Sponsorship { get; set; }
        public int TotalDonationsInHundreds { get; set; }
    }
}