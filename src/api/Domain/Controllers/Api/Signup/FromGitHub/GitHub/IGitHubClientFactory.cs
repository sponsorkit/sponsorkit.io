using Octokit;
using IConnection = Octokit.GraphQL.IConnection;

namespace Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.GitHub
{
    public interface IGitHubClientFactory
    {
        IGitHubClient CreateClientFromOAuthAuthenticationToken(string? token);
        IConnection CreateGraphQlClientFromOAuthAuthenticationToken(string? token);
    }
}
