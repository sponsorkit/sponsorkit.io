using System.Linq;
using MediatR;

namespace Sponsorkit.Domain.Queries.GetSponsorshipSummaries
{
    public class GetSponsorshipSummariesQuery : IRequest<IQueryable<GetSponsorshipSummaryResponse>>
    {
        public SummarySortOptions? Sort { get; set; }
    }
}