using System;

namespace Sponsorkit.Domain.Api.Sponsors.SponsorsBeneficiaryReferenceGet.Models.Sponsor
{
    public class SponsorResponse
    {
        public int? MonthlyAmountInHundreds { get; }
        public int TotalAmountInHundreds { get; }
        public DateTime StartedAtUtc { get; }

        public SponsorResponse(
            int? monthlyAmountInHundreds,
            int totalAmountInHundreds,
            DateTime startedAtUtc)
        {
            MonthlyAmountInHundreds = monthlyAmountInHundreds;
            TotalAmountInHundreds = totalAmountInHundreds;
            StartedAtUtc = startedAtUtc;
        }
    }
}