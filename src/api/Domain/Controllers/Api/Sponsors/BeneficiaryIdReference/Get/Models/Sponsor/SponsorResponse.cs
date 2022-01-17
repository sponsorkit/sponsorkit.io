using System;

namespace Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Get.Models.Sponsor;

public class SponsorResponse
{
    public long? MonthlyAmountInHundreds { get; }
    public long TotalAmountInHundreds { get; }
    public DateTimeOffset StartedAt { get; }

    public SponsorResponse(
        long? monthlyAmountInHundreds,
        long totalAmountInHundreds,
        DateTimeOffset startedAt)
    {
        MonthlyAmountInHundreds = monthlyAmountInHundreds;
        TotalAmountInHundreds = totalAmountInHundreds;
        StartedAt = startedAt;
    }
}