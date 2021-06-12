using System.Diagnostics.CodeAnalysis;

namespace Sponsorkit.Infrastructure.Options.GitHub
{

    [ExcludeFromCodeCoverage]
    public class GitHubOptions
    {
        public GitHubOAuthOptions OAuth { get; set; } = null!;
    }
}