namespace Sponsorkit.Domain.Api.Sponsors.Models
{
    public class SponsorsResponse
    {
        public SponsorResponse Current { get; }
            
        public SponsorsByAmountResponse ByAmount { get; }
            
        public SponsorsResponse(
            SponsorResponse current, 
            SponsorsByAmountResponse byAmount)
        {
            Current = current;
            ByAmount = byAmount;
        }
    }
}