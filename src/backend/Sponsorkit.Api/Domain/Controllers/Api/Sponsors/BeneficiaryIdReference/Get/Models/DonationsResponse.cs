namespace Sponsorkit.Api.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Get.Models;

public class DonationsResponse
{
    public DonationsResponse(
        long totalInHundreds,
        long monthlyInHundreds)
    {
        TotalInHundreds = totalInHundreds;
        MonthlyInHundreds = monthlyInHundreds;
    }

    public long TotalInHundreds { get; }
    public long MonthlyInHundreds { get; }
}