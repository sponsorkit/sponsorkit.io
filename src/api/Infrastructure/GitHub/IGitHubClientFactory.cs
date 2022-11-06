using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Octokit;
using IConnection = Octokit.GraphQL.IConnection;
using User = Sponsorkit.Domain.Models.Database.User;

namespace Sponsorkit.Infrastructure.GitHub;

public interface IGitHubClientFactory
{
    IGitHubClient CreateClientFromOAuthAuthenticationToken(string? token);
    IConnection CreateGraphQlClientFromOAuthAuthenticationToken(string? token);

    Task<string?> GetAccessTokenFromUserIfPresentAsync(
        ClaimsPrincipal user,
        CancellationToken cancellationToken);

    Task<string?> GetAccessTokenFromUserIfPresentAsync(
        User user);
}