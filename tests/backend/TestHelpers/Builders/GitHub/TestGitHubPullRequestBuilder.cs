using System.Threading;
using System.Threading.Tasks;
using Octokit;
using Sponsorkit.BusinessLogic.Domain.Models;

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
        var defaultBranch = await gitHubClient.Git.Reference.Get(
            "sponsorkit",
            "playground",
            "heads/main");
        
        var integrationTestBranch = await gitHubClient.Git.Reference.Get(
            "sponsorkit",
            "playground",
            "heads/integration-test");
        
        var pullRequest = await gitHubClient.PullRequest.Create(
            "sponsorkit",
            "playground",
            new NewPullRequest(
                "some-title",
                integrationTestBranch.Ref,
                defaultBranch.Ref));

        return pullRequest;
    }
}