using System;
using System.Linq;
using System.Net.Http;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Octokit;
using Octokit.Internal;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.Options.GitHub;
using Sponsorkit.Infrastructure.Security.Encryption;
using IConnection = Octokit.GraphQL.IConnection;
using Connection = Octokit.GraphQL.Connection;
using User = Sponsorkit.Domain.Models.User;
using OctokitConnection = Octokit.Connection;

namespace Sponsorkit.Infrastructure.GitHub;

public class GitHubClientFactory : IGitHubClientFactory
{
    private readonly IOptionsMonitor<GitHubOptions> githubOptionsMonitor;
    private readonly IAesEncryptionHelper aesEncryptionHelper;
    private readonly HttpClientAdapter httpClientAdapter;
    private readonly HttpClient httpClient;
    private readonly DataContext dataContext;

    private const string ProductHeaderValue = "sponsorkit.io";

    public GitHubClientFactory(
        IOptionsMonitor<GitHubOptions> githubOptionsMonitor,
        IAesEncryptionHelper aesEncryptionHelper,
        HttpClientAdapter httpClientAdapter,
        HttpClient httpClient,
        DataContext dataContext)
    {
        this.githubOptionsMonitor = githubOptionsMonitor;
        this.aesEncryptionHelper = aesEncryptionHelper;
        this.httpClientAdapter = httpClientAdapter;
        this.httpClient = httpClient;
        this.dataContext = dataContext;
    }

    public IGitHubClient CreateClientFromOAuthAuthenticationToken(string? token)
    {
        var connection = new OctokitConnection(
            new ProductHeaderValue(ProductHeaderValue),
            GitHubClient.GitHubApiUrl,
            new InMemoryCredentialStore(
                new Credentials(PickToken(token))),
            httpClientAdapter,
            new SimpleJsonSerializer());
            
        var client = new GitHubClient(connection);
        return client;
    }

    public IConnection CreateGraphQlClientFromOAuthAuthenticationToken(string? token)
    {
        return new Connection(
            new (ProductHeaderValue),
            new Octokit.GraphQL.Internal.InMemoryCredentialStore(
                PickToken(token)),
            httpClient);
    }

    public async Task<string?> GetAccessTokenFromUserIfPresentAsync(
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var userId = user.GetId();
        if (userId == null) 
            return null;
            
        var encryptedAccessToken = await dataContext.Users
            .AsQueryable()
            .Where(x => x.Id == userId)
            .Select(x => x.GitHub!.EncryptedAccessToken)
            .SingleOrDefaultAsync(cancellationToken);
        return await DecryptAccessTokenAsync(encryptedAccessToken);
    }

    private async Task<string?> DecryptAccessTokenAsync(byte[]? encryptedAccessToken)
    {
        if (encryptedAccessToken == null)
            return null;

        return await aesEncryptionHelper.DecryptAsync(encryptedAccessToken);
    }

    public async Task<string?> GetAccessTokenFromUserIfPresentAsync(User user)
    {
        return await DecryptAccessTokenAsync(user.GitHub?.EncryptedAccessToken);
    }

    private string PickToken(string? token)
    {
        return
            token ??
            githubOptionsMonitor.CurrentValue.BountyhuntBot.PersonalAccessToken;
    }
}