using Sponsorkit.Domain.Models.Database.Builders;

namespace Sponsorkit.Tests.TestHelpers.Builders.GitHub;

public class TestIssueBuilder : IssueBuilder
{
    public TestIssueBuilder()
    {
        WithGitHubInformation(
            1337,
            1338,
            "dummy-title");
        WithRepository(new TestRepositoryBuilder().BuildAsync().Result);
    }   
}