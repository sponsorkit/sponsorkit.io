using System.Linq;
using MediatR;
using Sponsorkit.Domain.Queries.GetBeneficiarySponsorshipSummaries;

namespace Sponsorkit.Domain.Queries.GetSponsorshipSummaries
{
    public class GetSponsorshipSummariesQuery : IRequest<IQueryable<GetSponsorshipSummaryResponse>>
    {
        public SummarySortOptions? Sort { get; set; }
    }
}