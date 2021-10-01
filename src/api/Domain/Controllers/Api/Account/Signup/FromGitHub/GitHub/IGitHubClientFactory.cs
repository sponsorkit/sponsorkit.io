using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Octokit;
using IConnection = Octokit.GraphQL.IConnection;

namespace Sponsorkit.Domain.Controllers.Api.Account.Signup.FromGitHub.GitHub
{
    public interface IGitHubClientFactory
    {
        IGitHubClient CreateClientFromOAuthAuthenticationToken(string? token);
        IConnection CreateGraphQlClientFromOAuthAuthenticationToken(string? token);

        Task<string?> GetAccessTokenFromUserIfPresentAsync(
            ClaimsPrincipal user,
            CancellationToken cancellationToken);
    }
}
