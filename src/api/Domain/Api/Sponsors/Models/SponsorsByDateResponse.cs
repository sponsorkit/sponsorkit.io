namespace Sponsorkit.Domain.Api.Sponsors.Models
{
    public class SponsorsByDateResponse
    {
        public SponsorResponse[] Latest { get; }
        public SponsorResponse[] Oldest { get; }

        public SponsorsByDateResponse(
            SponsorResponse[] latest,
            SponsorResponse[] oldest)
        {
            Latest = latest;
            Oldest = oldest;
        }
    }
}