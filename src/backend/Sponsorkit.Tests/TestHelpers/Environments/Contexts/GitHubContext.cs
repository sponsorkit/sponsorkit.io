using Microsoft.Extensions.Options;
using Octokit;
using Sponsorkit.BusinessLogic.Infrastructure.GitHub;
using Sponsorkit.BusinessLogic.Infrastructure.Options.GitHub;
using Sponsorkit.Tests.TestHelpers.Builders.GitHub;
using IConnection = Octokit.GraphQL.IConnection;

namespace Sponsorkit.Tests.TestHelpers.Environments.Contexts;

public class GitHubContext
{
    public GitHubUserContext SponsorkitBot { get; }
    public GitHubUserContext BountyhuntBot { get; }
    
    public GitHubContext(
        IGitHubClientFactory gitHubClientFactory,
        IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor)
    {
        var bountyhuntOptions = gitHubOptionsMonitor.CurrentValue.BountyhuntBot;
        var sponsorkitOptions = gitHubOptionsMonitor.CurrentValue.SponsorkitBot;
        
        SponsorkitBot = new GitHubUserContext(
            gitHubClientFactory.CreateClientFromOAuthAuthenticationToken(sponsorkitOptions.PersonalAccessToken),
            gitHubClientFactory.CreateGraphQlClientFromOAuthAuthenticationToken(sponsorkitOptions.PersonalAccessToken));
        BountyhuntBot = new GitHubUserContext(
            gitHubClientFactory.CreateClientFromOAuthAuthenticationToken(bountyhuntOptions.PersonalAccessToken),
            gitHubClientFactory.CreateGraphQlClientFromOAuthAuthenticationToken(bountyhuntOptions.PersonalAccessToken));
    }
}

public class GitHubUserContext
{
    private readonly IGitHubClient gitHubRestClient;
    private readonly IConnection gitHubGraphClient;

    public IGitHubClient RestClient => gitHubRestClient;

    public IConnection GraphClient => gitHubGraphClient;
    
    public TestGitHubPullRequestBuilder PullRequestBuilder => new (gitHubRestClient);
    
    public TestGitHubIssueBuilder IssueBuilder => new (gitHubRestClient);

    public GitHubUserContext(
        IGitHubClient gitHubRestClient,
        IConnection gitHubGraphClient)
    {
        this.gitHubRestClient = gitHubRestClient;
        this.gitHubGraphClient = gitHubGraphClient;
    }
}