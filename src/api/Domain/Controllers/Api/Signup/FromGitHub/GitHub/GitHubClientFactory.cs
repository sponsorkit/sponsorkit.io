using System;
using Microsoft.Extensions.Options;
using Octokit;
using Octokit.GraphQL;
using Octokit.Internal;
using Sponsorkit.Infrastructure.Options.GitHub;
using GraphQLProductHeaderValue = Octokit.GraphQL.ProductHeaderValue;
using IConnection = Octokit.GraphQL.IConnection;
using Connection = Octokit.GraphQL.Connection;
using ProductHeaderValue = Octokit.ProductHeaderValue;

namespace Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.GitHub
{
    public class GitHubClientFactory : IGitHubClientFactory
    {
        private readonly IOptionsMonitor<GitHubOptions> githubOptionsMonitor;

        private const string ProductHeaderValue = "sponsorkit.io";

        public GitHubClientFactory(
            IOptionsMonitor<GitHubOptions> githubOptionsMonitor)
        {
            this.githubOptionsMonitor = githubOptionsMonitor;
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

        private string PickToken(string? token)
        {
            return
                token ??
                githubOptionsMonitor.CurrentValue.BountyhuntBot.PersonalAccessToken;
        }
    }

}