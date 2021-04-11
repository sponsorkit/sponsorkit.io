namespace Sponsorkit.Domain.Api.Sponsors.Models
{
    public class SponsorsResponse
    {
        public SponsorResponse? Current { get; }
            
        public SponsorsByAmountResponse ByAmount { get; }
        public SponsorsByDateResponse ByDate { get; }
            
        public SponsorsResponse(
            SponsorResponse? current, 
            SponsorsByAmountResponse byAmount, 
            SponsorsByDateResponse byDate)
        {
            Current = current;
            ByAmount = byAmount;
            ByDate = byDate;
        }
    }
}