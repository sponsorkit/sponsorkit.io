using System;
using Octokit;
using Octokit.Internal;
using GraphQLProductHeaderValue = Octokit.GraphQL.ProductHeaderValue;

namespace Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.GitHub
{
    public class GitHubClientFactory : IGitHubClientFactory
    {
        private const string ProductHeaderValue = "sponsorkit.io";
        
        public IGitHubClient CreateClientFromOAuthAuthenticationToken(string token)
        {
            if (string.IsNullOrWhiteSpace(token))
                throw new InvalidOperationException("No token provided.");

            var client = new GitHubClient(
                GetProductHeaderValue(),
                new InMemoryCredentialStore(
                    new Credentials(token)));
            
            return client;
        }

        public static ProductHeaderValue GetProductHeaderValue()
        {
            return new(ProductHeaderValue);
        }

        public static GraphQLProductHeaderValue GetGraphQLProductHeaderValue()
        {
            return new(ProductHeaderValue);
        }
    }

}
