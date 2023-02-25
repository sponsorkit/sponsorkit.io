using Octokit;
using Sponsorkit.Tests.TestHelpers.Builders.GitHub;
using IConnection = Octokit.GraphQL.IConnection;

namespace Sponsorkit.Tests.TestHelpers.Environments.Contexts;

public class GitHubContext
{
    private readonly IGitHubClient gitHubRestClient;
    private readonly IConnection gitHubGraphClient;

    public IGitHubClient RestClient => gitHubRestClient;

    public IConnection GraphClient => gitHubGraphClient;
    
    public TestGitHubPullRequestBuilder PullRequestBuilder => new (gitHubRestClient);
    
    public TestGitHubIssueBuilder IssueBuilder => new (gitHubRestClient);

    public GitHubContext(
        IGitHubClient gitHubRestClient,
        IConnection gitHubGraphClient)
    {
        this.gitHubRestClient = gitHubRestClient;
        this.gitHubGraphClient = gitHubGraphClient;
    }
}