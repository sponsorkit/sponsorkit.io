using Sponsorkit.Domain.Models.Builders;

namespace Sponsorkit.Tests.TestHelpers.Builders.Models
{
    public class TestRepositoryBuilder : RepositoryBuilder
    {
        public TestRepositoryBuilder()
        {
            WithGitHubInformation(
                1337,
                "some-owner-name", 
                "some-name");
        }
    }
}