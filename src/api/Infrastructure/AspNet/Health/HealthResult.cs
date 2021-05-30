using System;
using System.Collections.Generic;

namespace Sponsorkit.Infrastructure.AspNet.Health
{
    public class HealthResult
    {
        public string? Status { get; init; }
        public TimeSpan? Duration { get; init; }
        public ICollection<HealthInformation>? Information { get; init; }
    }
}
