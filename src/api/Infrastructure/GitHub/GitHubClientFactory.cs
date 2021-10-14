using System;
using System.Linq;
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

namespace Sponsorkit.Infrastructure.GitHub
{
    public class GitHubClientFactory : IGitHubClientFactory
    {
        private readonly IOptionsMonitor<GitHubOptions> githubOptionsMonitor;
        private readonly IAesEncryptionHelper aesEncryptionHelper;
        private readonly DataContext dataContext;

        private const string ProductHeaderValue = "sponsorkit.io";

        public GitHubClientFactory(
            IOptionsMonitor<GitHubOptions> githubOptionsMonitor,
            IAesEncryptionHelper aesEncryptionHelper,
            DataContext dataContext)
        {
            this.githubOptionsMonitor = githubOptionsMonitor;
            this.aesEncryptionHelper = aesEncryptionHelper;
            this.dataContext = dataContext;
        }

        public IGitHubClient CreateClientFromOAuthAuthenticationToken(string? token)
        {
            var client = new GitHubClient(
                new (ProductHeaderValue),
                new InMemoryCredentialStore(
                    new Credentials(PickToken(token))));
            client.Connection.SetRequestTimeout(TimeSpan.FromSeconds(5));
            
            return client;
        }

        public IConnection CreateGraphQlClientFromOAuthAuthenticationToken(string? token)
        {
            return new Connection(
                new (ProductHeaderValue),
                PickToken(token));
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

}