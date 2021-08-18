using System;

namespace Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Get.Models.Sponsor
{
    public class SponsorResponse
    {
        public int? MonthlyAmountInHundreds { get; }
        public int TotalAmountInHundreds { get; }
        public DateTimeOffset StartedAtUtc { get; }

        public SponsorResponse(
            int? monthlyAmountInHundreds,
            int totalAmountInHundreds,
            DateTimeOffset startedAtUtc)
        {
            MonthlyAmountInHundreds = monthlyAmountInHundreds;
            TotalAmountInHundreds = totalAmountInHundreds;
            StartedAtUtc = startedAtUtc;
        }
    }
}