using System.Diagnostics.CodeAnalysis;

#pragma warning disable 8618

namespace Sponsorkit.BusinessLogic.Infrastructure.Options.GitHub;

[ExcludeFromCodeCoverage]
public class GitHubOptions
{
    public GitHubOAuthOptions OAuth { get; set; }
    public GitHubBotOptions BountyhuntBot { get; set; }
}