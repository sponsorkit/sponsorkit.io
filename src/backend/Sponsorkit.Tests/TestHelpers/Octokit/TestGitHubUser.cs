using Octokit;

namespace Sponsorkit.Tests.TestHelpers.Octokit;

public class TestGitHubUser : User
{
    public TestGitHubUser()
    {
        Name = "some-name";
        Login = "some-login";
    }

    public new int Id
    {
        get => base.Id;
        set => base.Id = value;
    }
}