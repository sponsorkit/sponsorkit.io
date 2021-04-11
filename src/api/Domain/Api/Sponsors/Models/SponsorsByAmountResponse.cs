namespace Sponsorkit.Domain.Api.Sponsors.Models
{
    public class SponsorsByAmountResponse
    {
        public SponsorsByAmountResponse(
            SponsorResponse[] most,
            SponsorResponse[] least)
        {
            Most = most;
            Least = least;
        }

        public SponsorResponse[] Most { get; }
        public SponsorResponse[] Least { get; }
    }
}