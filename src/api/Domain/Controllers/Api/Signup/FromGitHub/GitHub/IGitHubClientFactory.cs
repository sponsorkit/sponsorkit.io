using Octokit;

namespace Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.GitHub
{
    public interface IGitHubClientFactory
    {
        IGitHubClient CreateClientFromOAuthAuthenticationToken(string token);
    }
}
