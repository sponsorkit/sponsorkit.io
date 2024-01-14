using System;
using System.Linq;
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
            var mainBranch = await gitHubClient.RetryOnRateLimitExceeded(
                async client => await client.Repository.Branch.Get(
                    GitHubTestConstants.RepositoryOwnerName,
                    GitHubTestConstants.RepositoryName,
                    "main"));

            var newBranch = await gitHubClient.RetryOnRateLimitExceeded(
                async client => await client.Git.Reference.Create(
                    GitHubTestConstants.RepositoryOwnerName,
                    GitHubTestConstants.RepositoryName,
                    new NewReference(
                        $"refs/heads/{Guid.NewGuid()}",
                        mainBranch.Commit.Sha)));

            const string branchMarkdownFileName = "BRANCH.md";

            var branchMarkdownFile = await gitHubClient.RetryOnRateLimitExceeded(
                async client => await client.Repository.Content.GetAllContentsByRef(
                    GitHubTestConstants.RepositoryOwnerName,
                    GitHubTestConstants.RepositoryName,
                    branchMarkdownFileName,
                    newBranch.Ref));

            var commit = await gitHubClient.RetryOnRateLimitExceeded(
                async client => await client.Repository.Content.UpdateFile(
                    GitHubTestConstants.RepositoryOwnerName,
                    GitHubTestConstants.RepositoryName,
                    branchMarkdownFileName,
                    new UpdateFileRequest(
                        Guid.NewGuid().ToString(),
                        Guid.NewGuid().ToString(),
                        branchMarkdownFile.First().Sha,
                        newBranch.Ref)));

            var pullRequest = await gitHubClient.RetryOnRateLimitExceeded(
                async client => await client.PullRequest.Create(
                    GitHubTestConstants.RepositoryOwnerName,
                    GitHubTestConstants.RepositoryName,
                    new NewPullRequest(
                        Guid.NewGuid().ToString(),
                        newBranch.Ref,
                        "main")));

            return pullRequest;
        }
        catch (Exception)
        {
            throw;
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