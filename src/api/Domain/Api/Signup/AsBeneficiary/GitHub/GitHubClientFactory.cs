using System;
using MediatR;
using Microsoft.Extensions.Options;
using Octokit;
using Octokit.Internal;
using Serilog;

namespace Sponsorkit.Domain.Api.Signup.AsBeneficiary.GitHub
{
    public class GitHubClientFactory : IGitHubClientFactory
    {
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
            return new("sponsorkit.io");
        }
    }

}
