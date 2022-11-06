using System.Threading;
using System.Threading.Tasks;
using Octokit;
using Sponsorkit.Domain.Models;

namespace Sponsorkit.Tests.TestHelpers.Builders.GitHub;

public class TestGitHubUserBuilder : AsyncModelBuilder<User>
{
    public override Task<User> BuildAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new User(
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            default,
            "integration-test@example.com",
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
            default));
    }
}