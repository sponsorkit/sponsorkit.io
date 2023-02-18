using System;
using Microsoft.Extensions.DependencyInjection;
using Octokit;
using Sponsorkit.BusinessLogic.Infrastructure.GitHub;
using Sponsorkit.Tests.TestHelpers.Builders.GitHub;

namespace Sponsorkit.Tests.TestHelpers.Environments.Contexts;

public class GitHubContext
{
    private readonly IServiceProvider serviceProvider;

    public GitHubContext(IServiceProvider serviceProvider)
    {
        this.serviceProvider = serviceProvider;
    }
    
    public IGitHubClient FakeClient => serviceProvider.GetRequiredService<IGitHubClient>();
    
    public IGitHubClientFactory FakeClientFactory => serviceProvider.GetRequiredService<IGitHubClientFactory>();

    public TestGitHubPullRequestBuilder PullRequestBuilder => new ();
}