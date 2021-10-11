using Octokit;

namespace Sponsorkit.Tests.TestHelpers.Octokit
{
    public class TestRepository : Repository
    {
        public TestRepository()
        {
            Name = "owner-name";
            Owner = new TestUser();
        }
    }

}