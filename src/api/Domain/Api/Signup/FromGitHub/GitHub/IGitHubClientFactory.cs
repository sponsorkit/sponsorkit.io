using Octokit;

namespace Sponsorkit.Domain.Api.Signup.FromGitHub.GitHub
{
    public interface IGitHubClientFactory
    {
        IGitHubClient CreateClientFromOAuthAuthenticationToken(string token);
    }
}
