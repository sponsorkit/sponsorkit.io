using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Sponsorkit.Domain.Queries.GetSponsorshipSummaries;

namespace Sponsorkit.Domain.Queries.GetBeneficiarySponsorshipSummaries
{
    public class GetBeneficiarySponsorshipSummariesQueryHandler : IRequestHandler<GetBeneficiarySponsorshipSummariesQuery, IQueryable<GetSponsorshipSummaryResponse>>
    {
        private readonly IMediator _mediator;

        public GetBeneficiarySponsorshipSummariesQueryHandler(
            IMediator mediator)
        {
            _mediator = mediator;
        }
        
        public async Task<IQueryable<GetSponsorshipSummaryResponse>> Handle(GetBeneficiarySponsorshipSummariesQuery request, CancellationToken cancellationToken)
        {
            var sponsorships = await _mediator.Send(
                new GetSponsorshipSummariesQuery()
                {
                    Sort = request.Sort
                },
                cancellationToken);

            sponsorships = sponsorships.Where(x =>
                x.Beneficiary.Id == request.BeneficiaryId);
            
            if (request.Take != null)
                sponsorships = sponsorships.Take(request.Take.Value);

            return sponsorships;
        }
    }
}