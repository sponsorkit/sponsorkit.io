using System;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;
using Sponsorkit.Tests.TestHelpers.Environments;
using Sponsorkit.Tests.TestHelpers.Octokit;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public class TestIssueBuilder : IssueBuilder
{
    private readonly IIntegrationTestEnvironment environment;

    public TestIssueBuilder(
        IIntegrationTestEnvironment environment)
    {
        this.environment = environment;
    }
    
    public override async Task<Issue> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (GitHub == null)
        {
            WithGitHubInformation(await environment.GitHub.BountyhuntBot.IssueBuilder.BuildAsync(cancellationToken));
        }
        
        if (Repository == null)
        {
            WithRepository(await environment.Database.RepositoryBuilder
                .WithGitHubInformation(
                    GitHub?.Id ?? throw new InvalidOperationException("GitHub ID was not set."), 
                    GitHubTestConstants.RepositoryOwnerName, 
                    GitHubTestConstants.RepositoryName)
                .BuildAsync(cancellationToken));
        }
        
        var issue = await base.BuildAsync(cancellationToken);
       
        await environment.Database.Context.Issues.AddAsync(issue, cancellationToken);
        await environment.Database.Context.SaveChangesAsync(cancellationToken);

        return issue;
    }
}