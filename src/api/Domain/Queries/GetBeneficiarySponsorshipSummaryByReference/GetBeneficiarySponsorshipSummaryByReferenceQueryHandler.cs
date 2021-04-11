using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Queries.GetBeneficiarySponsorshipSummaries;
using Sponsorkit.Domain.Queries.GetSponsorshipSummaries;

namespace Sponsorkit.Domain.Queries.GetBeneficiarySponsorshipSummaryByReference
{
    public class GetBeneficiarySponsorshipSummaryByReferenceQueryHandler : IRequestHandler<GetBeneficiarySponsorshipSummaryByReferenceQuery, GetSponsorshipSummaryResponse>
    {
        private readonly IMediator _mediator;

        public GetBeneficiarySponsorshipSummaryByReferenceQueryHandler(
            IMediator mediator)
        {
            _mediator = mediator;
        }
        
        public async Task<GetSponsorshipSummaryResponse> Handle(
            GetBeneficiarySponsorshipSummaryByReferenceQuery request, 
            CancellationToken cancellationToken)
        {
            var allSponsorships = await _mediator.Send(
                new GetBeneficiarySponsorshipSummariesQuery(request.BeneficiaryId),
                cancellationToken);

            return await allSponsorships
                .Where(x =>
                    x.Sponsorship.Reference == request.SponsorshipReference)
                .SingleOrDefaultAsync(cancellationToken);
        }
    }
}