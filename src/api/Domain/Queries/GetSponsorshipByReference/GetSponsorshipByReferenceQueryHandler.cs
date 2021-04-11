using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;

namespace Sponsorkit.Domain.Queries.GetSponsorshipByReference
{
    public class GetSponsorshipByReferenceQueryHandler : IRequestHandler<GetSponsorshipByReferenceQuery, GetSponsorshipByReferenceResponse>
    {
        private readonly DataContext _dataContext;

        public GetSponsorshipByReferenceQueryHandler(
            DataContext dataContext)
        {
            _dataContext = dataContext;
        }
        
        public async Task<GetSponsorshipByReferenceResponse> Handle(
            GetSponsorshipByReferenceQuery request, 
            CancellationToken cancellationToken)
        {
            var response = await _dataContext.Sponsorships
                .Include(x => x.Sponsor)
                .Include(x => x.Payments)
                .Where(x => 
                    x.Reference == request.SponsorshipReference &&
                    x.Beneficiary.Id == request.BeneficiaryId)
                .Select(x => new
                {
                    User = x.Sponsor,
                    Sponsorship = x,
                    TotalDonationsInHundreds = x.Payments.Sum(
                        p => p.AmountInHundreds)
                })
                .SingleOrDefaultAsync(cancellationToken);

            return new GetSponsorshipByReferenceResponse(
                response.User,
                response.Sponsorship,
                response.TotalDonationsInHundreds);
        }
    }
}