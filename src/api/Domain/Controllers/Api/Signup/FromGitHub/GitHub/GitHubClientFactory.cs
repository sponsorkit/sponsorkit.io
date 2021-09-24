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
using GraphQLProductHeaderValue = Octokit.GraphQL.ProductHeaderValue;
using IConnection = Octokit.GraphQL.IConnection;
using Connection = Octokit.GraphQL.Connection;

namespace Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.GitHub
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
            return new GitHubClient(
                new (ProductHeaderValue),
                new InMemoryCredentialStore(
                    new Credentials(PickToken(token))));
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
            
            var databaseUser = await dataContext.Users.SingleOrDefaultAsync(
                x => x.Id == userId,
                cancellationToken);
            var encryptedToken = databaseUser.GitHub?.EncryptedAccessToken;
            return encryptedToken != null ? 
                await aesEncryptionHelper.DecryptAsync(encryptedToken) :
                null;
        }

        private string PickToken(string? token)
        {
            return
                token ??
                githubOptionsMonitor.CurrentValue.BountyhuntBot.PersonalAccessToken;
        }
    }

}