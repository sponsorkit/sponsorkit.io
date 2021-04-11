using System.Collections.Generic;

namespace Sponsorkit.Domain.Api.Sponsors.Models
{
    public class SponsorsByDateResponse
    {
        public IEnumerable<SponsorResponse> Latest { get; }
        public IEnumerable<SponsorResponse> Oldest { get; }

        public SponsorsByDateResponse(
            IEnumerable<SponsorResponse> latest,
            IEnumerable<SponsorResponse> oldest)
        {
            Latest = latest;
            Oldest = oldest;
        }
    }
}