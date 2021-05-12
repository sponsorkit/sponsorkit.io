using Octokit;

namespace Sponsorkit.Domain.Api.Signup.SignupAsBeneficiaryPost.GitHub
{
    public interface IGitHubClientFactory
    {
        IGitHubClient CreateClientFromOAuthAuthenticationToken(string token);
    }
}
