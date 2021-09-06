using System;
using Hangfire.Common;
using Hangfire.States;
using Hangfire.Storage;

namespace Sponsorkit.Infrastructure.Hangfire
{
    public class ExpirationTimeFilterAttribute : JobFilterAttribute, IApplyStateFilter
    {
        public void OnStateUnapplied(ApplyStateContext context, IWriteOnlyTransaction transaction)
        {
            context.JobExpirationTimeout = TimeSpan.FromDays(3);
        }

        public void OnStateApplied(ApplyStateContext context, IWriteOnlyTransaction transaction)
        {
            context.JobExpirationTimeout = TimeSpan.FromDays(3);
        }
    }
}