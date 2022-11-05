using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Sponsorkit.Infrastructure.GitHub;

namespace Sponsorkit.Infrastructure.AspNet.Health;

public class GitHubHealthCheck : IHealthCheck
{
    private readonly IGitHubClientFactory gitHubClientFactory;

    public GitHubHealthCheck(
        IGitHubClientFactory gitHubClientFactory)
    {
        this.gitHubClientFactory = gitHubClientFactory;
    }
        
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var client = gitHubClientFactory.CreateClientFromOAuthAuthenticationToken(null);
        var limits = await client.RateLimit.GetRateLimits();
        if (limits == null)
            return HealthCheckResult.Degraded("No rate limits returned from GitHub.");

        return HealthCheckResult.Healthy("Client is healthy.");
    }
}