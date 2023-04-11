using Octokit;

namespace Sponsorkit.Tests.TestHelpers.Octokit;

public class TestGitHubUser : User
{
    public TestGitHubUser()
    {
        Name = "some-name";
        Login = "some-login";
    }

    public new string Email
    {
        get => base.Email;
        set => base.Email = value;
    }

    public new int Id
    {
        get => base.Id;
        set => base.Id = value;
    }
}