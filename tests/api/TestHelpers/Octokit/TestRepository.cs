using Octokit;

namespace Sponsorkit.Tests.TestHelpers.Octokit;

public class TestRepository : Repository
{
    public TestRepository() : base(
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        new TestUser(),
        "owner-name",
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default,
        default)
    {
    }
}