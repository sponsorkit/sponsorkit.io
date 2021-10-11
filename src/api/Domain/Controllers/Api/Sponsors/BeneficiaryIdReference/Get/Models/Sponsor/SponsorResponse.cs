using System;

namespace Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Get.Models.Sponsor
{
    public class SponsorResponse
    {
        public long? MonthlyAmountInHundreds { get; }
        public long TotalAmountInHundreds { get; }
        public DateTimeOffset StartedAtUtc { get; }

        public SponsorResponse(
            long? monthlyAmountInHundreds,
            long totalAmountInHundreds,
            DateTimeOffset startedAtUtc)
        {
            MonthlyAmountInHundreds = monthlyAmountInHundreds;
            TotalAmountInHundreds = totalAmountInHundreds;
            StartedAtUtc = startedAtUtc;
        }
    }
}