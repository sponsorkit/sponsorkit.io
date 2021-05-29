using Octokit;

namespace Sponsorkit.Domain.Api.Signup.AsBeneficiary.GitHub
{
    public interface IGitHubClientFactory
    {
        IGitHubClient CreateClientFromOAuthAuthenticationToken(string token);
    }
}
