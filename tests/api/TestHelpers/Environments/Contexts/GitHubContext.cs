using Sponsorkit.Tests.TestHelpers.Builders.GitHub;

namespace Sponsorkit.Tests.TestHelpers.Environments.Contexts;

public class GitHubContext
{
    public TestGitHubPullRequestBuilder PullRequest { get; } = new TestGitHubPullRequestBuilder();
}