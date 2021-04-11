using Sponsorkit.Domain.Models;

namespace Sponsorkit.Domain.Queries.GetSponsorshipByReference
{
    public class GetSponsorshipByReferenceResponse
    {
        public User User { get; }
        public Sponsorship Sponsorship { get; }
        public int TotalDonationsInHundreds { get; }

        public GetSponsorshipByReferenceResponse(
            User user,
            Sponsorship sponsorship,
            int totalDonationsInHundreds)
        {
            User = user;
            Sponsorship = sponsorship;
            TotalDonationsInHundreds = totalDonationsInHundreds;
        }
    }
}