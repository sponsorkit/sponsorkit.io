namespace Sponsorkit.Domain.Api.Sponsors.Models
{
    public class Response
    {
        public DonationsResponse Donations { get; }
        public SponsorsResponse Sponsors { get; }
            
        public Response(
            DonationsResponse donations,
            SponsorsResponse sponsors)
        {
            Donations = donations;
            Sponsors = sponsors;
        }
    }
}