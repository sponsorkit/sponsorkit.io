using System;
using System.Threading;
using System.Threading.Tasks;
using Hangfire;
using Hangfire.Server;
using Serilog;
using Serilog.Context;

namespace Sponsorkit.Infrastructure.Hangfire
{
    [DisableConcurrentExecution(5)]
    [AutomaticRetry(Attempts = 0)]
    [ExpirationTimeFilter]
    public abstract class Job
    {
        public async Task RunAsync(IJobCancellationToken? jobCancellationToken, PerformContext? performContext)
        {
            using (LogContext.PushProperty("CorrelationId", Guid.NewGuid().ToString()))
            using (LogContext.PushProperty("JobName", GetType().Name))
            using (LogContext.Push(new PerformContextEnricher(performContext)))
            {
                await OnRunAsync(performContext, jobCancellationToken?.ShutdownToken ?? default);
            }
        }

        protected abstract Task OnRunAsync(
            PerformContext? performContext,
            CancellationToken cancellationToken);
    }

}