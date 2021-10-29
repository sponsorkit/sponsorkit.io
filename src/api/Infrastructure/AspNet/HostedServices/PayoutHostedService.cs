using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;

namespace Sponsorkit.Infrastructure.AspNet.HostedServices
{
    public class PayoutHostedService : TimedHostedService
    {
        protected override TimeSpan Interval => TimeSpan.FromHours(1);
        
        protected override async Task RunJobAsync(
            IServiceProvider serviceProvider, 
            CancellationToken cancellationToken)
        {
            var dataContext = serviceProvider.GetRequiredService<DataContext>();
            
            var bountyClaimRequestsByBounty = await dataContext.BountyClaimRequests
                .AsQueryable()
                .Where(x => x.ExpiredAt == null)
                .GroupBy(x => x.BountyId)
                .Select(x => new
                {
                    x.Key,
                    ClaimRequests = x
                })
                .ToArrayAsync(cancellationToken);
            foreach (var bountyRequests in bountyClaimRequestsByBounty)
            {
                var amountOfVotesByVerdictType = bountyRequests.ClaimRequests
                    .GroupBy(x => x.Verdict)
                    .ToDictionary(
                        x => x.Key,
                        x => x.Count());

                var undecidedVoteCount = amountOfVotesByVerdictType[ClaimVerdict.Undecided];
                var scamVoteCount = amountOfVotesByVerdictType[ClaimVerdict.Scam];
                var solvedCount = amountOfVotesByVerdictType[ClaimVerdict.Solved];
                var unsolvedCount = amountOfVotesByVerdictType[ClaimVerdict.Unsolved];
                
                var totalCount = amountOfVotesByVerdictType.Sum(x => x.Value);
            }
        }

        public PayoutHostedService(IServiceProvider serviceProvider) : base(serviceProvider)
        {
        }
    }
}