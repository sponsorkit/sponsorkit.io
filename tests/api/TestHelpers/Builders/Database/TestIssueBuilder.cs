using Sponsorkit.Domain.Models.Database.Builders;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public class TestIssueBuilder : IssueBuilder
{
    public TestIssueBuilder()
    {
        WithGitHubInformation(
            1337,
            1338,
            "dummy-title");
        WithRepository(new TestRepositoryBuilder()
            .BuildAsync()
            .ConfigureAwait(false)
            .GetAwaiter()
            .GetResult());
    }   
}