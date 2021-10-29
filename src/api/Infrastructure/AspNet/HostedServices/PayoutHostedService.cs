using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Domain.Models.Context;

namespace Sponsorkit.Infrastructure.AspNet.HostedServices
{
    public class PayoutHostedService : TimedHostedService
    {
        protected override TimeSpan Interval => TimeSpan.FromHours(1);

        public PayoutHostedService()
        {
        }
        
        protected override Task RunJobAsync(CancellationToken cancellationToken)
        {
            //TODO
            return Task.CompletedTask;
        }
    }
}