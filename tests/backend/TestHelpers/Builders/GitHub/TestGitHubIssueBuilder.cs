using System.Threading;
using System.Threading.Tasks;
using Octokit;
using Sponsorkit.BusinessLogic.Domain.Models;

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
            "sponsorkit",
            "playground",
            new NewIssue(
                "some-title"));

        return issue;
    }
}