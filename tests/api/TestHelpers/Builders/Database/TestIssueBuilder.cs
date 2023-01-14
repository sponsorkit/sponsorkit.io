using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Domain.Models.Database;
using Sponsorkit.Domain.Models.Database.Builders;
using Sponsorkit.Tests.TestHelpers.Environments;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public class TestIssueBuilder : IssueBuilder
{
    private readonly IIntegrationTestEnvironment environment;

    public TestIssueBuilder(IIntegrationTestEnvironment environment)
    {
        this.environment = environment;
        
        WithGitHubInformation(
            1337,
            1338,
            "dummy-title");
    }

    public override async Task<Issue> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (Repository == null)
        {
            WithRepository(await environment.Database.RepositoryBuilder
                .BuildAsync(cancellationToken));
        }
        
        var issue = await base.BuildAsync(cancellationToken);
       
        await environment.Database.Context.Issues.AddAsync(issue, cancellationToken);
        await environment.Database.Context.SaveChangesAsync(cancellationToken);

        return issue;
    }
}