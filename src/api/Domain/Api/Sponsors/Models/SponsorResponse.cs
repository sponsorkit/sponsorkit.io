using System;

namespace Sponsorkit.Domain.Api.Sponsors.Models
{
    public class SponsorResponse
    {
        public string Name { get; }
        public int? MonthlyAmountInHundreds { get; }
        public int TotalAmountInHundreds { get; }
        public DateTime StartedAtUtc { get; }

        public SponsorResponse(
            string name,
            int? monthlyAmountInHundreds,
            int totalAmountInHundreds,
            DateTime startedAtUtc)
        {
            Name = name;
            MonthlyAmountInHundreds = monthlyAmountInHundreds;
            TotalAmountInHundreds = totalAmountInHundreds;
            StartedAtUtc = startedAtUtc;
        }
    }
}