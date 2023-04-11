using System;
using System.Threading;
using System.Threading.Tasks;
using Octokit;
using Sponsorkit.BusinessLogic.Domain.Models;
using Sponsorkit.BusinessLogic.Infrastructure.GitHub;
using Sponsorkit.Tests.TestHelpers.Octokit;

namespace Sponsorkit.Tests.TestHelpers.Builders.GitHub;

public class TestGitHubIssueBuilder : AsyncModelBuilder<Issue>
{
    private readonly IGitHubClient gitHubClient;

    public TestGitHubIssueBuilder(
        IGitHubClient gitHubClient)
    {
        this.gitHubClient = gitHubClient;
    }

    public override async Task<Issue> BuildAsync(CancellationToken cancellationToken = default)
    {
        await WaitToPreventRateLimitingAsync(cancellationToken);

        try
        {
            var issue = await gitHubClient.RetryOnRateLimitExceeded(
                async client => await client.Issue.Create(
                    GitHubTestConstants.RepositoryOwnerName,
                    GitHubTestConstants.RepositoryName,
                    new NewIssue(
                        "some-title")));

            return issue;
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