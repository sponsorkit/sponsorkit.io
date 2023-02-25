using System.Security.Claims;
using Octokit;
using IConnection = Octokit.GraphQL.IConnection;
using User = Sponsorkit.BusinessLogic.Domain.Models.Database.User;

namespace Sponsorkit.BusinessLogic.Infrastructure.GitHub;

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