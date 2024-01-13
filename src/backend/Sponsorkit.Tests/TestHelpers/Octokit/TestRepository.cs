using System;
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
        1337,
        default,
        new TestGitHubUser(),
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
        Array.Empty<string>(),
        default,
        default,
        default)
    {
    }
}