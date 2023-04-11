using System.Threading;
using System.Threading.Tasks;
using Octokit;
using Sponsorkit.BusinessLogic.Domain.Models;
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
        var issue = await gitHubClient.Issue.Create(
            GitHubTestConstants.RepositoryOwnerName,
            GitHubTestConstants.RepositoryName,
            new NewIssue(
                "some-title"));

        return issue;
    }
}