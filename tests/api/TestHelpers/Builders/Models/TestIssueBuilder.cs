using Sponsorkit.Domain.Models.Builders;

namespace Sponsorkit.Tests.TestHelpers.Builders.Models;

public class TestIssueBuilder : IssueBuilder
{
    public TestIssueBuilder()
    {
        WithGitHubInformation(
            1337,
            1338,
            "dummy-title");
        WithRepository(new TestRepositoryBuilder());
    }   
}