using System;
using System.Linq;
using MediatR;
using Sponsorkit.Domain.Queries.GetSponsorshipSummaries;

namespace Sponsorkit.Domain.Queries.GetBeneficiarySponsorshipSummaries
{
    public class GetBeneficiarySponsorshipSummariesQuery : IRequest<IQueryable<GetSponsorshipSummaryResponse>>
    {
        public Guid BeneficiaryId { get; }
        
        public int? Take { get; set; }
        
        public SummarySortOptions? Sort { get; set; }

        public GetBeneficiarySponsorshipSummariesQuery(
            Guid beneficiaryId)
        {
            BeneficiaryId = beneficiaryId;
        }
    }
}