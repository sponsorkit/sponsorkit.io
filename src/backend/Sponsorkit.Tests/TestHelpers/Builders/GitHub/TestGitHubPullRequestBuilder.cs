using System;
using System.Threading;
using System.Threading.Tasks;
using Octokit;
using Sponsorkit.BusinessLogic.Domain.Models;
using Sponsorkit.BusinessLogic.Infrastructure.GitHub;
using Sponsorkit.Tests.TestHelpers.Octokit;

namespace Sponsorkit.Tests.TestHelpers.Builders.GitHub;

public class TestGitHubPullRequestBuilder : AsyncModelBuilder<PullRequest>
{
    private readonly IGitHubClient gitHubClient;

    public TestGitHubPullRequestBuilder(
        IGitHubClient gitHubClient)
    {
        this.gitHubClient = gitHubClient;
    }

    public override async Task<PullRequest> BuildAsync(CancellationToken cancellationToken = default)
    {
        await WaitToPreventRateLimitingAsync(cancellationToken);

        try
        {
            var pullRequest = await gitHubClient.RetryOnRateLimitExceeded(
                async client => await client.PullRequest.Create(
                    GitHubTestConstants.RepositoryOwnerName,
                    GitHubTestConstants.RepositoryName,
                    new NewPullRequest(
                        "some-title",
                        "main",
                        "integration-test")));

            return pullRequest;
        }
        finally
        {
            await WaitToPreventRateLimitingAsync(cancellationToken);
        }
    }

    private static async Task WaitToPreventRateLimitingAsync(CancellationToken cancellationToken)
    {
        //GitHub recommends waiting 1 second after creating a pull request: https://docs.github.com/en/rest/guides/best-practices-for-integrators?apiVersion=2022-11-28#dealing-with-secondary-rate-limits
        await Task.Delay(GitHubTestConstants.ApiCreationThrottleDelay, cancellationToken);
    }
}