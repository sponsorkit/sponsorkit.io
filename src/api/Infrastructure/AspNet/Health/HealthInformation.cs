using System;

namespace Sponsorkit.Infrastructure.AspNet.Health
{
    public class HealthInformation
    {
        public string? Key { get; init; }
        public string? Description { get; init; }
        public TimeSpan? Duration { get; init; }
        public string? Status { get; init; }
        public string? Error { get; init; }
    }

}
