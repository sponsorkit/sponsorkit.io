using Microsoft.Extensions.Options;
using Octokit;
using Sponsorkit.BusinessLogic.Infrastructure.GitHub;
using Sponsorkit.BusinessLogic.Infrastructure.Options.GitHub;
using Sponsorkit.Tests.TestHelpers.Builders.GitHub;
using IConnection = Octokit.GraphQL.IConnection;

namespace Sponsorkit.Tests.TestHelpers.Environments.Contexts;

public class GitHubContext
{
    public GitHubBotContext SponsorkitBot { get; }
    public GitHubBotContext BountyhuntBot { get; }
    
    public GitHubContext(
        IGitHubClientFactory gitHubClientFactory,
        IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor)
    {
        SponsorkitBot = new GitHubBotContext(gitHubClientFactory, gitHubOptionsMonitor.CurrentValue.SponsorkitBot);
        BountyhuntBot = new GitHubBotContext(gitHubClientFactory, gitHubOptionsMonitor.CurrentValue.BountyhuntBot);
    }
}

public class GitHubBotContext
{
    private readonly IGitHubClient gitHubRestClient;
    private readonly IConnection gitHubGraphClient;

    public IGitHubClient RestClient => gitHubRestClient;

    public IConnection GraphClient => gitHubGraphClient;
    
    public TestGitHubPullRequestBuilder PullRequestBuilder => new (gitHubRestClient);
    
    public TestGitHubIssueBuilder IssueBuilder => new (gitHubRestClient);
    
    public GitHubBotOptions Options { get; }

    public GitHubBotContext(
        IGitHubClientFactory gitHubClientFactory,
        GitHubBotOptions options)
    {
        this.gitHubRestClient = gitHubClientFactory.CreateClientFromOAuthAuthenticationToken(options.PersonalAccessToken);
        this.gitHubGraphClient = gitHubClientFactory.CreateGraphQlClientFromOAuthAuthenticationToken(options.PersonalAccessToken);
        
        this.Options = options;
    }
}