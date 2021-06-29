namespace Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Get.Models
{
    public class DonationsResponse
    {
        public DonationsResponse(
            int totalInHundreds,
            int monthlyInHundreds)
        {
            TotalInHundreds = totalInHundreds;
            MonthlyInHundreds = monthlyInHundreds;
        }

        public int TotalInHundreds { get; }
        public int MonthlyInHundreds { get; }
    }
}