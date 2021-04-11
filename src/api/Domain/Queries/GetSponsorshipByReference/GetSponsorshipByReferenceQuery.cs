using System;
using MediatR;

namespace Sponsorkit.Domain.Queries.GetSponsorshipByReference
{
    public class GetSponsorshipByReferenceQuery : IRequest<GetSponsorshipByReferenceResponse>
    {
        public string SponsorshipReference { get; }

        public Guid BeneficiaryId { get; }

        public GetSponsorshipByReferenceQuery(Guid beneficiaryId, string sponsorshipReference)
        {
            SponsorshipReference = sponsorshipReference;
            BeneficiaryId = beneficiaryId;
        }
    }
}