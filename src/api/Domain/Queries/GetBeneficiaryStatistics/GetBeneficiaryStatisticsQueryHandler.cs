using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;

namespace Sponsorkit.Domain.Queries.GetBeneficiaryStatistics
{
    public class GetBeneficiaryStatisticsQueryHandler : IRequestHandler<GetBeneficiaryStatisticsQuery, GetBeneficiaryStatisticsResponse>
    {
        private readonly DataContext _dataContext;

        public GetBeneficiaryStatisticsQueryHandler(
            DataContext dataContext)
        {
            _dataContext = dataContext;
        }
        
        public async Task<GetBeneficiaryStatisticsResponse> Handle(GetBeneficiaryStatisticsQuery request, CancellationToken cancellationToken)
        {
            return await _dataContext.Sponsorships
                .Include(x => x.Payments)
                .Select(x => new GetBeneficiaryStatisticsResponse
                {
                    MonthlyInHundreds = x.MonthlyAmountInHundreds ?? 0,
                    TotalInHundreds = x.Payments.Sum(p => p.AmountInHundreds)
                })
                .SingleOrDefaultAsync(cancellationToken);
        }
    }
}