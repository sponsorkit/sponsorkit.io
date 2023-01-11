using System.Threading;
using System.Threading.Tasks;
using Octokit;
using Sponsorkit.Domain.Models;
using Sponsorkit.Tests.TestHelpers.Octokit;

namespace Sponsorkit.Tests.TestHelpers.Builders.GitHub;

public class TestGitHubPullRequestBuilder : AsyncModelBuilder<PullRequest>
{
    private User user;

    public TestGitHubPullRequestBuilder()
    {
        this.user = new TestGitHubUser();
    }

    public TestGitHubPullRequestBuilder WithUser(User user)
    {
        this.user = user;
        return this;
    }

    public override Task<PullRequest> BuildAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new PullRequest(
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            user,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default));
    }
}