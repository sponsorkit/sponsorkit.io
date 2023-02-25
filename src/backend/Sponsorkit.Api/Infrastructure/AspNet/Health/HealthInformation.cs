using System;

namespace Sponsorkit.Api.Infrastructure.AspNet.Health;

public class HealthInformation
{
    public string? Key { get; set; }
    public string? Description { get; set; }
    public TimeSpan? Duration { get; set; }
    public string? Status { get; set; }
    public string? Error { get; set; }
}