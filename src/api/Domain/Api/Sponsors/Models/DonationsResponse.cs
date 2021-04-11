﻿namespace Sponsorkit.Domain.Api.Sponsors.Models
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