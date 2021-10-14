using Octokit;

namespace Sponsorkit.Tests.TestHelpers.Octokit
{
    public class TestUser : User
    {
        public TestUser()
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
}