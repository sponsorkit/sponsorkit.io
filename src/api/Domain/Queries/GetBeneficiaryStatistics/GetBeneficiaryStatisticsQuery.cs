using System;
using MediatR;

namespace Sponsorkit.Domain.Queries.GetBeneficiaryStatistics
{
    public class GetBeneficiaryStatisticsQuery : IRequest<GetBeneficiaryStatisticsResponse>
    {
        public Guid BeneficiaryId { get; }

        public GetBeneficiaryStatisticsQuery(Guid beneficiaryId)
        {
            BeneficiaryId = beneficiaryId;
        }
    }
}