using System.Threading;
using System.Threading.Tasks;
using Octokit;
using Sponsorkit.BusinessLogic.Domain.Models;
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
        var pullRequest = await gitHubClient.PullRequest.Create(
            GitHubTestConstants.RepositoryOwnerName,
            GitHubTestConstants.RepositoryName,
            new NewPullRequest(
                "some-title",
                "main",
                "integration-test"));

        return pullRequest;
    }
}