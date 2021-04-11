using System;
using MediatR;
using Sponsorkit.Domain.Queries.GetSponsorshipSummaries;

namespace Sponsorkit.Domain.Queries.GetBeneficiarySponsorshipSummaryByReference
{
    public class GetBeneficiarySponsorshipSummaryByReferenceQuery : IRequest<GetSponsorshipSummaryResponse>
    {
        public string SponsorshipReference { get; }

        public Guid BeneficiaryId { get; }

        public GetBeneficiarySponsorshipSummaryByReferenceQuery(Guid beneficiaryId, string sponsorshipReference)
        {
            SponsorshipReference = sponsorshipReference;
            BeneficiaryId = beneficiaryId;
        }
    }
}