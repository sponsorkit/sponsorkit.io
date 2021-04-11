using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;

namespace Sponsorkit.Domain.Queries.GetSponsorshipSummaries
{
    public class GetSponsorshipSummariesQueryHandler : IRequestHandler<GetSponsorshipSummariesQuery, IQueryable<GetSponsorshipSummaryResponse>>
    {
        private readonly DataContext _dataContext;

        public GetSponsorshipSummariesQueryHandler(
            DataContext dataContext)
        {
            _dataContext = dataContext;
        }
        
        public async Task<IQueryable<GetSponsorshipSummaryResponse>> Handle(GetSponsorshipSummariesQuery request, CancellationToken cancellationToken)
        {
            var sponsorships = _dataContext.Sponsorships
                .Include(x => x.Sponsor)
                .Include(x => x.Payments)
                .Select(x => new GetSponsorshipSummaryResponse() {
                    Beneficiary = x.Beneficiary,
                    Sponsorship = x,
                    TotalDonationsInHundreds = x.Payments.Sum(
                        p => p.AmountInHundreds)
                });
            
            if (request.Sort != null)
            {
                var sort = request.Sort.Value;
                
                var property = sort.Property;
                var direction = sort.Direction;
                
                sponsorships = direction == SortDirection.Ascending ?
                    (property == SummarySortProperty.ByAmount ?
                        sponsorships.OrderBy(x => x.TotalDonationsInHundreds) :
                        sponsorships.OrderBy(x => x.Sponsorship.CreatedAtUtc)) :
                    (property == SummarySortProperty.ByAmount ?
                        sponsorships.OrderByDescending(x => x.TotalDonationsInHundreds) :
                        sponsorships.OrderByDescending(x => x.Sponsorship.CreatedAtUtc));
            }

            return sponsorships;
        }
    }
}