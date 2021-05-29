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
        private readonly IGitHubClient gitHubClient;
        private readonly ILogger logger;

        private readonly IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor;
        private readonly IMediator mediator;

        public GitHubClientFactory(
            IGitHubClient gitHubClient,
            ILogger logger,
            IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor,
            IMediator mediator)
        {
            this.gitHubClient = gitHubClient;
            this.logger = logger;
            this.gitHubOptionsMonitor = gitHubOptionsMonitor;
            this.mediator = mediator;
        }

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

        private static ProductHeaderValue GetProductHeaderValue()
        {
            return new("sponsorkit.io");
        }
    }

}
