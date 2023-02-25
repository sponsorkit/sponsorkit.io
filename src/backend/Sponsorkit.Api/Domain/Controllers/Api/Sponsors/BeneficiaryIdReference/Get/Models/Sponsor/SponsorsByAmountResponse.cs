using System.Collections.Generic;

namespace Sponsorkit.Api.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Get.Models.Sponsor;

public class SponsorsByAmountResponse
{
    public SponsorsByAmountResponse(
        IEnumerable<SponsorResponse> most,
        IEnumerable<SponsorResponse> least)
    {
        Most = most;
        Least = least;
    }

    public IEnumerable<SponsorResponse> Most { get; }
    public IEnumerable<SponsorResponse> Least { get; }
}